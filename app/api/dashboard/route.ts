import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";

type OrderRow = { payable_amount:number; quantity:number; order_status:string; talent_name_raw:string; product_name_raw:string|null; paid_at:string };

export async function GET(request: Request) {
  const auth = await requireApiUser(); if (auth.error) return auth.error;
  const url = new URL(request.url); const start=url.searchParams.get("start"); const end=url.searchParams.get("end");
  const all:OrderRow[]=[]; const pageSize=1000;
  for(let from=0;;from+=pageSize){
    let query=auth.admin.from("orders").select("payable_amount,quantity,order_status,talent_name_raw,product_name_raw,paid_at").order("paid_at").range(from,from+pageSize-1);
    if(start) query=query.gte("paid_at",`${start}T00:00:00`); if(end) query=query.lte("paid_at",`${end}T23:59:59`);
    const {data,error}=await query; if(error) return NextResponse.json({error:error.message},{status:400});
    all.push(...(data as OrderRow[])); if(!data||data.length<pageSize) break;
  }
  const talentMap=new Map<string,{gmv:number;gsv:number;orders:number}>(); const productMap=new Map<string,{gmv:number;qty:number;talents:Set<string>}>(); const dailyMap=new Map<string,{gmv:number;gsv:number}>();
  let gmv=0,gsv=0,quantity=0,validOrders=0;
  for(const o of all){const amount=Number(o.payable_amount)||0;const valid=o.order_status!=="已关闭";gmv+=amount;quantity+=o.quantity||0;if(valid){gsv+=amount;validOrders++}const t=talentMap.get(o.talent_name_raw)||{gmv:0,gsv:0,orders:0};t.gmv+=amount;t.gsv+=valid?amount:0;t.orders++;talentMap.set(o.talent_name_raw,t);const pName=o.product_name_raw||"待映射商品";const p=productMap.get(pName)||{gmv:0,qty:0,talents:new Set<string>()};p.gmv+=amount;p.qty+=o.quantity||0;p.talents.add(o.talent_name_raw);productMap.set(pName,p);const day=o.paid_at.slice(0,10);const d=dailyMap.get(day)||{gmv:0,gsv:0};d.gmv+=amount;d.gsv+=valid?amount:0;dailyMap.set(day,d)}
  return NextResponse.json({gmv,gsv,orders:all.length,validOrders,quantity,activeTalents:talentMap.size,talents:[...talentMap].map(([name,v])=>({name,...v})).sort((a,b)=>b.gmv-a.gmv).slice(0,50),products:[...productMap].map(([name,v])=>({name,gmv:v.gmv,qty:v.qty,talents:v.talents.size})).sort((a,b)=>b.gmv-a.gmv).slice(0,50),daily:[...dailyMap].map(([date,v])=>({date,...v})).sort((a,b)=>a.date.localeCompare(b.date))});
}
