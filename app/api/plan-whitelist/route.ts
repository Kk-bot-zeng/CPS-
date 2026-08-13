import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { isChannel } from "@/lib/channels";
import { pool } from "@/lib/db";

export async function GET(request: Request) {
  const auth = await requireApiUser(); if (auth.error) return auth.error;
  const channel = new URL(request.url).searchParams.get("channel") || "jd";
  const category = new URL(request.url).searchParams.get("category") || "tv";
  if (!isChannel(channel)) return NextResponse.json({ error:"无效渠道" }, {status:400});
  if (category !== "tv" && category !== "monitor") return NextResponse.json({error:"无效品类"},{status:400});
  const { rows } = await pool.query("select u.file_name,u.row_count,u.created_at,count(i.id)::int as enabled_rows from plan_whitelist_uploads u left join plan_whitelist_items i on i.upload_id=u.id and i.enabled=true where u.channel=$1 and u.product_category=$2 and u.active=true group by u.id",[channel,category]);
  return NextResponse.json(rows[0] || null);
}
export async function POST(request: Request) {
  const auth = await requireApiUser(); if (auth.error) return auth.error;
  const body = await request.json(); const channel=body.channel; const category=body.category === "monitor" ? "monitor" : "tv"; if (!isChannel(channel)) return NextResponse.json({error:"无效渠道"},{status:400});
  const plans=[...new Set((body.plans||[]).map((x:unknown)=>String(x).trim()).filter(Boolean))]; if(!plans.length) return NextResponse.json({error:"计划白名单不能为空"},{status:400});
  const client=await pool.connect(); try { await client.query("begin"); await client.query("update plan_whitelist_uploads set active=false where channel=$1 and product_category=$2",[channel,category]); const {rows:[u]}=await client.query("insert into plan_whitelist_uploads(channel,product_category,file_name,row_count,created_by) values($1,$2,$3,$4,$5) returning id",[channel,category,body.fileName||"计划白名单.xlsx",plans.length,auth.user.id]); for(const plan of plans) await client.query("insert into plan_whitelist_items(upload_id,channel,product_category,plan_name) values($1,$2,$3,$4)",[u.id,channel,category,plan]); await client.query("commit"); return NextResponse.json({ok:true,rowCount:plans.length}); } catch(e){await client.query("rollback");throw e;} finally{client.release();}
}
