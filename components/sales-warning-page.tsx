"use client";
import { AlertTriangle, BellRing, CalendarDays, ChevronRight, Clock3, Search, ShieldAlert, TrendingUp, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { channelName, type ChannelFilter } from "@/lib/channels";
import BusinessSelect from "@/components/business-select";

export type WarningRow={resource_key:string;resource_type:"talent"|"leader";name:string;channel:string;last_sale_date:string|null;first_sale_date:string|null;sale_days:number;total_qty:number;total_amount:number;inactive_days:number|null;severity:"light"|"medium"|"heavy";consecutive_sale_days:number;unread:boolean;recent_sales:{sale_date:string;quantity:number;amount:number}[]};
export type WarningPayload={rows:WarningRow[];unreadCount:number;generatedAt:string};
const severity={light:{name:"轻度预警",hint:"15天未动销"},medium:{name:"中度预警",hint:"30天未动销"},heavy:{name:"重度预警",hint:"60天及以上未动销"}};
const money=(v:number)=>`¥${v.toLocaleString("zh-CN",{maximumFractionDigits:0})}`;
export async function loadWarnings(channel:ChannelFilter="all"){const r=await fetch(`/api/sales-warnings?channel=${channel}`,{cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.error||"预警读取失败");return j as WarningPayload;}
export async function acknowledgeWarnings(keys:string[]){if(!keys.length)return;await fetch("/api/sales-warnings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({keys})});}

export function WarningPopup({data,onView}:{data:WarningPayload;onView:()=>void}){
  const unread=data.rows.filter(x=>x.unread), heavy=unread.filter(x=>x.severity==="heavy").length;
  if(!unread.length)return null;
  return <div className="warning-popup"><div className="warning-popup-icon"><BellRing size={23}/></div><div><span>动销预警提醒</span><h3>{unread.length} 位达人/团长需要关注</h3><p>{heavy?`其中 ${heavy} 项为重度预警，请优先跟进。`:"存在连续未动销资源，请及时查看。"}</p><button onClick={onView}>查看预警详情 <ChevronRight size={15}/></button></div></div>;
}

export default function SalesWarningPage({channel,onRead}:{channel:ChannelFilter;onRead?:()=>void}){
 const [data,setData]=useState<WarningPayload|null>(null),[q,setQ]=useState(""),[level,setLevel]=useState("all"),[selected,setSelected]=useState<WarningRow|null>(null),[loading,setLoading]=useState(true);
 useEffect(()=>{setLoading(true);loadWarnings(channel).then(async x=>{setData(x);const keys=x.rows.filter(r=>r.unread).map(r=>r.resource_key);await acknowledgeWarnings(keys);setData({...x,unreadCount:0,rows:x.rows.map(r=>({...r,unread:false}))});onRead?.();}).finally(()=>setLoading(false));},[channel]);
 const rows=useMemo(()=>data?.rows.filter(x=>(level==="all"||x.severity===level)&&(!q.trim()||`${x.name}${channelName(x.channel)}`.toLowerCase().includes(q.trim().toLowerCase())))||[],[data,q,level]);
 const counts=(kind:string)=>data?.rows.filter(x=>kind==="all"||x.severity===kind).length||0;
 if(loading)return <div className="warning-loading">正在计算动销预警…</div>;
 return <><div className="warning-page-head"><div><h2>动销预警中心</h2><p>按渠道追踪达人与团长的销售活跃度，预警从最后一次动销日期开始计算</p></div><div className="warning-rule"><ShieldAlert size={18}/><span>15天轻度 · 30天中度 · 60天重度</span></div></div>
 <div className="warning-kpis"><button className={level==="all"?"active":""} onClick={()=>setLevel("all")}><span>全部预警</span><b>{counts("all")}</b><small>当前需跟进资源</small></button>{(["light","medium","heavy"] as const).map(x=><button key={x} className={`${x} ${level===x?"active":""}`} onClick={()=>setLevel(x)}><span>{severity[x].name}</span><b>{counts(x)}</b><small>{severity[x].hint}</small></button>)}</div>
 <div className="warning-panel"><div className="warning-toolbar"><div><h3>预警明细</h3><p>点击任意记录查看最近动销动态</p></div><div className="warning-search"><Search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="搜索达人或团长"/></div></div>
 <div className="warning-table-wrap"><table className="warning-table"><thead><tr><th>预警等级</th><th>渠道</th><th>达人/团长</th><th>最近动销</th><th>连续未动销</th><th>最近连续动销</th><th>累计动销天数</th><th>操作</th></tr></thead><tbody>{rows.map(row=><tr key={row.resource_key}><td><span className={`warning-badge ${row.severity}`}><i/>{severity[row.severity].name}</span></td><td>{channelName(row.channel)}</td><td><b>{row.name}</b><small>{row.resource_type==="leader"?"团长":"达人"}</small></td><td>{row.last_sale_date||"从未动销"}</td><td><strong className={row.severity}>{row.inactive_days==null?"60+":row.inactive_days} 天</strong></td><td>{row.consecutive_sale_days} 天</td><td>{row.sale_days} 天</td><td><button onClick={()=>setSelected(row)}>查看详情 <ChevronRight size={14}/></button></td></tr>)}{!rows.length&&<tr><td colSpan={8} className="warning-empty">当前筛选条件下没有预警记录</td></tr>}</tbody></table></div></div>
 {selected&&<div className="warning-modal-mask" onMouseDown={()=>setSelected(null)}><div className="warning-modal" onMouseDown={e=>e.stopPropagation()}><button className="warning-modal-close" onClick={()=>setSelected(null)}><X/></button><div className="warning-modal-title"><span className={`warning-badge ${selected.severity}`}>{severity[selected.severity].name}</span><h2>{selected.name}</h2><p>{channelName(selected.channel)} · {selected.resource_type==="leader"?"团长":"达人"}</p></div><div className="warning-detail-grid"><div><CalendarDays/><span>最近一次动销</span><b>{selected.last_sale_date||"从未动销"}</b></div><div><Clock3/><span>连续未动销</span><b>{selected.inactive_days==null?"60+":selected.inactive_days} 天</b></div><div><TrendingUp/><span>最近连续动销</span><b>{selected.consecutive_sale_days} 天</b></div><div><AlertTriangle/><span>累计销售表现</span><b>{selected.total_qty.toLocaleString()} 台 · {money(selected.total_amount)}</b></div></div><div className="warning-history"><h3>最近动销动态</h3>{selected.recent_sales.length?selected.recent_sales.map(x=><div key={x.sale_date}><span>{x.sale_date}</span><b>{x.quantity} 台</b><em>{money(x.amount)}</em></div>):<p>暂无动销记录</p>}</div></div></div>}</>;
}
