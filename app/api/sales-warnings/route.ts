import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { pool } from "@/lib/db";
import { isChannel } from "@/lib/channels";

type ResourceRow = { resource_key:string; resource_id:string; resource_type:"talent"|"leader"; name:string; channel:string; cooperation_status:string; last_sale_date:string|null; first_sale_date:string|null; sale_days:number; total_qty:number; total_amount:number };
type DayRow = { channel:string; name:string; sale_date:string; quantity:number; amount:number };
const dayMs = 86400000;
const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Shanghai", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
const daysBetween = (from:string, to:string) => Math.max(0, Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs));
const severityOf = (days:number, never:boolean) => never || days >= 60 ? "heavy" : days >= 30 ? "medium" : days >= 15 ? "light" : "normal";

async function warningRows(channel:string) {
  const params:unknown[] = [], channelSql = channel === "all" ? "" : (params.push(channel), `where platform=$${params.length}`);
  const resources = await pool.query<ResourceRow>(`
    with resources as (
      select 'talent:'||platform||':'||name resource_key,min(id::text) resource_id,'talent'::text resource_type,name,platform channel,
        case when bool_or(cooperation_status <> '已终止') then '合作中' else '已终止' end cooperation_status
      from talents ${channelSql} group by platform,name
      union all
      select 'leader:'||platform||':'||name,min(id::text),'leader'::text,name,platform,
        case when bool_or(cooperation_status <> '已终止') then '合作中' else '已终止' end
      from leaders ${channelSql} group by platform,name
    ), sales as (
      select platform channel,talent_name_raw name,max((paid_at at time zone 'Asia/Shanghai')::date) last_sale_date,
        min((paid_at at time zone 'Asia/Shanghai')::date) first_sale_date,
        count(distinct (paid_at at time zone 'Asia/Shanghai')::date)::int sale_days,
        coalesce(sum(quantity),0)::int total_qty,coalesce(sum(payable_amount),0)::numeric total_amount
      from orders where is_talent=true and order_status <> '已关闭' group by platform,talent_name_raw
    )
    select r.*,s.last_sale_date::text,s.first_sale_date::text,coalesce(s.sale_days,0)::int sale_days,
      coalesce(s.total_qty,0)::int total_qty,coalesce(s.total_amount,0)::numeric total_amount
    from resources r left join sales s on s.channel=r.channel and s.name=r.name
    where r.cooperation_status <> '已终止'`, params);
  const days = await pool.query<DayRow>(`select platform channel,talent_name_raw name,(paid_at at time zone 'Asia/Shanghai')::date::text sale_date,sum(quantity)::int quantity,sum(payable_amount)::numeric amount from orders where is_talent=true and order_status <> '已关闭' group by platform,talent_name_raw,(paid_at at time zone 'Asia/Shanghai')::date order by sale_date desc`);
  const dayMap = new Map<string,DayRow[]>();
  for (const row of days.rows) { const key=`${row.channel}\0${row.name}`; const list=dayMap.get(key)||[]; list.push(row); dayMap.set(key,list); }
  const today=todayKey();
  return resources.rows.map((row) => {
    const history=dayMap.get(`${row.channel}\0${row.name}`)||[];
    const inactiveDays=row.last_sale_date ? daysBetween(row.last_sale_date,today) : null;
    const severity=severityOf(inactiveDays ?? 9999,!row.last_sale_date);
    let consecutiveSaleDays=0;
    if (history.length) { const dates=new Set(history.map(x=>x.sale_date)); let cursor=history[0].sale_date; while(dates.has(cursor)){ consecutiveSaleDays++; cursor=new Date(Date.parse(`${cursor}T00:00:00Z`)-dayMs).toISOString().slice(0,10); } }
    return {...row,total_amount:Number(row.total_amount),inactive_days:inactiveDays,severity,consecutive_sale_days:consecutiveSaleDays,recent_sales:history.slice(0,10).map(x=>({...x,amount:Number(x.amount)}))};
  }).filter(row=>row.severity!=="normal").sort((a,b)=>(b.inactive_days??9999)-(a.inactive_days??9999));
}

export async function GET(request:Request) {
  const auth=await requireApiUser(); if(auth.error)return auth.error;
  const channel=new URL(request.url).searchParams.get("channel")||"all";
  if(channel!=="all"&&!isChannel(channel))return NextResponse.json({error:"无效渠道"},{status:400});
  const rows=await warningRows(channel);
  const ack=await pool.query<{resource_key:string;severity:string;last_sale_at:string|null}>("select resource_key,severity,last_sale_at::date::text last_sale_at from sales_warning_acknowledgements where user_id=$1",[auth.user.id]);
  const ackMap=new Map(ack.rows.map(x=>[x.resource_key,x]));
  const result=rows.map(row=>{const seen=ackMap.get(row.resource_key);return {...row,unread:!seen||seen.severity!==row.severity||(seen.last_sale_at||null)!==(row.last_sale_date||null)};});
  return NextResponse.json({rows:result,unreadCount:result.filter(x=>x.unread).length,generatedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(request:Request) {
  const auth=await requireApiUser(); if(auth.error)return auth.error;
  const body=await request.json() as {keys?:string[]}; const keys=[...new Set(body.keys||[])];
  if(!keys.length)return NextResponse.json({ok:true,acknowledged:0});
  const current=await warningRows("all"); const selected=current.filter(x=>keys.includes(x.resource_key));
  for(const row of selected) await pool.query("insert into sales_warning_acknowledgements(user_id,resource_key,severity,last_sale_at,acknowledged_at) values($1,$2,$3,$4,now()) on conflict(user_id,resource_key) do update set severity=excluded.severity,last_sale_at=excluded.last_sale_at,acknowledged_at=now()",[auth.user.id,row.resource_key,row.severity,row.last_sale_date]);
  return NextResponse.json({ok:true,acknowledged:selected.length});
}
