"use client";
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  Download,
  Edit3,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { CHANNELS, channelName, type ChannelFilter } from "@/lib/channels";
import AmapMap, { type MapResource } from "@/components/amap-map";
import BusinessSelect from "@/components/business-select";

type Summary = {
  gmv: number;
  gsv: number;
  orders: number;
  validOrders: number;
  quantity: number;
  activeTalents: number;
  talents: { name: string; gmv: number; gsv: number; orders: number; qty: number }[];
  products: { name: string; gmv: number; gsv: number; qty: number; talents: number; orders: number }[];
  seriesProducts: { name: string; gmv: number; gsv: number; qty: number; talents: number; orders: number }[];
  daily: { date: string; gmv: number; gsv: number; qty: number; orders: number }[];
  talentModels: { talent: string; model: string; gmv: number; gsv: number; qty: number; orders: number }[];
};
type Talent = {
  id: string;
  name: string;
  platform: string | null;
  platform_account: string | null;
  match_id: string | null;
  phone: string | null;
  wechat: string | null;
  leader_id: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  longitude: number | null;
  latitude: number | null;
  cooperation_status: string;
  tags: string[];
  notes: string | null;
  leaders?: { name: string } | null;
};
type Leader = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  wechat: string | null;
  platform: string | null;
  match_id: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  longitude: number | null;
  latitude: number | null;
  cooperation_status: string;
  tags: string[];
  notes: string | null;
};
const money = (v: number) =>
  v >= 1e8 ? `¥${(v / 1e8).toFixed(2)}亿` : `¥${(v / 1e4).toFixed(1)}万`;
const seriesOf = (name: string) =>
  (name.replace(/^\s*\d{2,3}(?:\.\d+)?\s*/, "").replace(/\s+/g, "").replace(/(Plus|Ultra|Pro)/i, " $1").trim() || name);
const responseCache = new Map<string, { value: unknown; at: number }>();
const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const relativeDateKey = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return localDateKey(date); };
async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const isGet = !init?.method || init.method === "GET";
  const cached = responseCache.get(url);
  if (isGet && cached && Date.now() - cached.at < 60_000)
    return cached.value as T;
  const r = await fetch(url, init);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "请求失败");
  if (isGet) responseCache.set(url, { value: j, at: Date.now() });
  else responseCache.clear();
  return j;
}
export function RealOverview({ channel, category = "tv" }: { channel: ChannelFilter; category?: "tv" | "monitor" }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [talentOptions, setTalentOptions] = useState<{ value: string; label: string }[]>([]);
  const [modelOptions, setModelOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [start, setStart] = useState(() => relativeDateKey(-1));
  const [end, setEnd] = useState(() => relativeDateKey(-1));
  const [draftStart, setDraftStart] = useState(() => relativeDateKey(-1));
  const [draftEnd, setDraftEnd] = useState(() => relativeDateKey(-1));
  const [showCustomDates, setShowCustomDates] = useState(false);
  const [dateError, setDateError] = useState("");
  const dateAnchorRef = useRef<HTMLDivElement>(null);
  const dateTriggerRef = useRef<HTMLButtonElement>(null);
  const dateStartRef = useRef<HTMLInputElement>(null);
  const [talent, setTalent] = useState("all");
  const [model, setModel] = useState("all");
  const [productView, setProductView] = useState<"model" | "series">("model");
  const [expandedTalent, setExpandedTalent] = useState("");
  const [expandedTalentSeries, setExpandedTalentSeries] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const openDatePicker = () => {
    setDraftStart(start);
    setDraftEnd(end);
    setDateError("");
    setShowCustomDates(true);
  };
  const closeDatePicker = (restoreFocus = false) => {
    setShowCustomDates(false);
    setDateError("");
    if (restoreFocus) window.requestAnimationFrame(() => dateTriggerRef.current?.focus());
  };
  const applyCustomDates = () => {
    if (!draftStart || !draftEnd) return setDateError("请选择完整的开始和结束日期");
    if (draftStart > draftEnd) return setDateError("开始日期不能晚于结束日期");
    setStart(draftStart);
    setEnd(draftEnd);
    closeDatePicker(true);
  };
  useEffect(() => {
    if (!showCustomDates) return;
    window.requestAnimationFrame(() => dateStartRef.current?.focus());
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!dateAnchorRef.current?.contains(event.target as Node)) closeDatePicker(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDatePicker(true);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [showCustomDates]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(
        await jsonFetch(
          `/api/dashboard?start=${start}&end=${end}&channel=${channel}&category=${category}&talent=${encodeURIComponent(talent)}&model=${encodeURIComponent(model)}`,
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [start, end, channel, category, talent, model]);
  const downloadFiltered = () => {
    window.location.assign(`/api/dashboard-export?${new URLSearchParams({ start, end, channel, category, talent, model }).toString()}`);
  };
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    jsonFetch<Summary>(`/api/dashboard?start=${start}&end=${end}&channel=${channel}&category=${category}&talent=all&model=all`)
      .then((data) => {
        setTalentOptions(data.talents.map((x) => ({ value: x.name, label: x.name })));
        setModelOptions(data.seriesProducts.map((x) => ({ value: x.name, label: x.name })));
      })
      .catch(() => {});
  }, [start, end, channel, category]);
  if (loading) return <Loading />;
  if (!summary) return <Empty text="暂时无法读取销售数据" />;
  const rate = summary.gmv ? (summary.gsv / summary.gmv) * 100 : 0;
  const today = summary.daily.at(-1);
  const overviewLabel = start === end && start === relativeDateKey(-1) ? "昨日销售概览" : start === end && start === relativeDateKey(0) ? "今日销售概览" : "所选时段销售概览";
  const rankedProducts = productView === "model" ? summary.products : summary.seriesProducts;
  const productTalents = selectedProduct
    ? summary.talentModels.filter((x) => productView === "series" ? seriesOf(x.model) === selectedProduct : x.model === selectedProduct).reduce((map, x) => {
        const row = map.get(x.talent) || { name: x.talent, qty: 0, orders: 0, gmv: 0, gsv: 0 };
        row.qty += x.qty; row.orders += x.orders; row.gmv += x.gmv; row.gsv += Number(x.gsv) || 0; map.set(x.talent, row); return map;
      }, new Map<string, { name: string; qty: number; orders: number; gmv: number; gsv: number }>())
    : new Map<string, { name: string; qty: number; orders: number; gmv: number; gsv: number }>();
  const selectedProductTalents = [...productTalents.values()].sort((a, b) => b.qty - a.qty);
  return (
    <>
      <div className="page-title">
        <div>
          <h2>
            {category === "tv" ? "TV" : "显示器"}经营总览 · {channel === "all" ? "全部渠道" : channelName(channel)}
          </h2>
          <p>以下数据实时读取自Supabase订单库</p>
        </div>
        <div className="real-actions">
          <div className="date-range-bar">
            <div ref={dateAnchorRef} className="custom-date-anchor">
              <button ref={dateTriggerRef} className="date-range-trigger" onClick={() => showCustomDates ? closeDatePicker(true) : openDatePicker()} aria-expanded={showCustomDates} aria-haspopup="dialog" aria-controls="custom-date-popover"><CalendarDays size={15}/><span>{start}</span><em>至</em><span>{end}</span><ChevronDown size={14}/></button>
              {showCustomDates && <div id="custom-date-popover" className="custom-date-popover" role="dialog" aria-modal="false" aria-labelledby="custom-date-title">
                <div id="custom-date-title" className="custom-date-title"><b>自定义时间范围</b><small>选择完成后点击确定应用</small></div>
                <div className="custom-date-fields"><label>开始日期<input ref={dateStartRef} type="date" value={draftStart} onChange={(e) => { setDraftStart(e.target.value); setDateError(""); }} /></label><span>—</span>
                <label>结束日期<input type="date" value={draftEnd} min={draftStart} onChange={(e) => { setDraftEnd(e.target.value); setDateError(""); }} /></label></div>
                {dateError && <p className="custom-date-error">{dateError}</p>}
                <div className="custom-date-actions"><button onClick={() => closeDatePicker(true)}>取消</button><button className="primary" onClick={applyCustomDates}>确定</button></div>
              </div>}
            </div>
          </div>
           <BusinessSelect searchable value={talent} onChange={setTalent} options={[{ value:"all", label:"全部达人/团长" }, ...talentOptions]} />
           <BusinessSelect searchable value={model} onChange={setModel} options={[{ value:"all", label:"全部型号" }, ...modelOptions]} />
          <button onClick={load}>
            <RefreshCw size={14} />
            刷新
          </button>
          <button className="export-data" onClick={downloadFiltered}><Download size={14} /> 导出数据</button>
        </div>
      </div>
      <section className="command-brief">
        <div className="command-brief-copy">
          <span className="live-dot">● 实时经营中</span>
          <strong>{overviewLabel}</strong>
          <small>{today ? `${today.date} · 已同步 ${today.orders.toLocaleString()} 笔订单` : "等待订单数据同步"}</small>
        </div>
        <div className="command-brief-stat"><span>所选时段销售额</span><b>{money(summary.gmv)}</b></div>
        <div className="command-brief-stat"><span>所选时段销售台数</span><b>{summary.quantity.toLocaleString()} 台</b></div>
      </section>
      <div className={`kpi-grid ${channel === "jd" ? "jd-kpis" : ""}`}>
        <RealKpi
          label="GMV全部订单"
          value={money(summary.gmv)}
          note={`${summary.orders.toLocaleString()}笔订单`}
        />
        <RealKpi
          label="GSV有效订单"
          value={money(summary.gsv)}
          note={`${summary.validOrders.toLocaleString()}笔有效订单`}
        />
        {channel !== "jd" && <RealKpi
          label="金额有效率"
          value={`${rate.toFixed(1)}%`}
          note="GSV ÷ GMV"
        />}
        <RealKpi
          label="活跃达人"
          value={String(summary.activeTalents)}
          note={`销售数量 ${summary.quantity.toLocaleString()}`}
        />
        <RealKpi
          label="销售总台数"
          value={summary.quantity.toLocaleString()}
          note={`${summary.products.length} 个型号`}
        />
      </div>
      <div className="analytics-chart-grid">
        <div className="panel analytics-wide">
          <RealHead title="每日销售金额与台数趋势" />
          <SalesLineChart rows={summary.daily} />
        </div>
        <div className="panel">
          <div className="panel-head ranking-head"><div><h3>{productView === "model" ? "型号销量排名" : "系列销量排名"}</h3><p>实时业务数据</p></div><div className="ranking-switch"><button className={productView === "model" ? "active" : ""} onClick={() => { setProductView("model"); setSelectedProduct(""); }}>具体型号</button><button className={productView === "series" ? "active" : ""} onClick={() => { setProductView("series"); setSelectedProduct(""); }}>产品系列</button></div></div>
          <div className="rank-bars">
            {rankedProducts.slice(0, 10).map((p, i) => <Fragment key={p.name}>
              <div className={`clickable-rank ${selectedProduct === p.name ? "expanded" : ""}`} onClick={() => setSelectedProduct(selectedProduct === p.name ? "" : p.name)}>
                <span>{i + 1}</span><p><b>{p.name}</b><i><em style={{width:`${Math.max(4,p.qty/Math.max(rankedProducts[0]?.qty||1,1)*100)}%`}}/></i></p>
              <strong>{p.qty}台</strong><small><i>GMV {money(p.gmv)}</i><i>GSV {money(Number(p.gsv) || 0)}</i></small>
              </div>
               {selectedProduct === p.name && <div className="series-talent-panel inline"><div className="series-talent-title"><b>{p.name} · 达人/团长销售排名</b><button onClick={() => setSelectedProduct("")}>收起</button></div><div className="series-talent-columns"><span>排名</span><span>达人/团长</span><span>台数</span><span>订单</span><span>GMV</span><span>GSV</span></div>{selectedProductTalents.map((x, rank) => <div className="series-talent-row" key={x.name}><span>{rank + 1}</span><b>{x.name}</b><em>{x.qty}台</em><small>{x.orders}单</small><strong>{money(x.gmv)}</strong><strong>{money(x.gsv)}</strong></div>)}</div>}
            </Fragment>)}
          </div>
        </div>
      </div>
      <div className="dashboard-grid">
        <div className="panel wide">
          <RealHead
            title="达人/团长销售排行"
            action={() =>
              exportCsv(
                "达人排行.csv",
                summary.talents.map((x) => ({
                  达人: x.name,
                  GMV: x.gmv,
                  GSV: x.gsv,
                  订单: x.orders,
                })),
              )
            }
          />
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>排名</th>
                  <th>达人</th>
                  <th>GMV</th>
                  <th>GSV</th>
                  <th>订单数</th>
                  <th>销售台数</th>
                  <th>有效率</th>
                  <th>销售明细</th>
                </tr>
              </thead>
              <tbody>
                {summary.talents.slice(0, 12).map((t, i) => (
                  <Fragment key={t.name}>
                  <tr className={`talent-rank-row ${expandedTalent === t.name ? "expanded" : ""}`} onClick={() => { setExpandedTalent(expandedTalent === t.name ? "" : t.name); setExpandedTalentSeries(""); }}>
                    <td>{i + 1}</td>
                    <td>
                      <b>{t.name}</b>
                    </td>
                    <td>{money(t.gmv)}</td>
                    <td>{money(t.gsv)}</td>
                    <td>{t.orders}</td>
                    <td>{t.qty}</td>
                    <td>{t.gmv ? ((t.gsv / t.gmv) * 100).toFixed(1) : 0}%</td>
                    <td><button className="detail-toggle">{expandedTalent === t.name ? "收起" : "查看型号"}</button></td>
                  </tr>
                  {expandedTalent === t.name && <TalentSeriesDetail talent={t.name} rows={summary.talentModels.filter((x) => x.talent === t.name)} expanded={expandedTalentSeries} setExpanded={setExpandedTalentSeries} />}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
function TalentSeriesDetail({ talent, rows, expanded, setExpanded }: { talent: string; rows: Summary["talentModels"]; expanded: string; setExpanded: (x: string) => void }) {
  const series = [...rows.reduce((map, x) => { const name = seriesOf(x.model); const v = map.get(name) || { name, qty: 0, orders: 0, gmv: 0, gsv: 0 }; v.qty += x.qty; v.orders += x.orders; v.gmv += x.gmv; v.gsv += Number(x.gsv) || 0; map.set(name, v); return map; }, new Map<string, { name: string; qty: number; orders: number; gmv: number; gsv: number }>()).values()].sort((a,b)=>b.qty-a.qty);
  return <tr className="talent-model-detail"><td colSpan={8}><div><b>{talent} · 系列销售明细（点击系列查看尺寸型号）</b><div className="talent-series-grid"><div className="talent-series-head"><span>产品系列</span><span>销售台数</span><span>订单数</span><span>GMV</span><span>GSV</span><span /></div>{series.map((s) => <div className="talent-series-group" key={s.name}><button className="talent-series-row" onClick={() => setExpanded(expanded === s.name ? "" : s.name)}><b>{s.name}</b><span>{s.qty} 台</span><span>{s.orders}</span><span>{money(s.gmv)}</span><span>{money(s.gsv)}</span><em>{expanded === s.name ? "收起" : "查看型号"}</em></button>{expanded === s.name && <div className="model-nested-list">{rows.filter((x) => seriesOf(x.model) === s.name).sort((a,b)=>b.qty-a.qty).map((x) => <p key={x.model}><b>{x.model}</b><span>{x.qty} 台</span><span>{x.orders} 单</span><strong>{money(x.gmv)}</strong><strong>{money(x.gsv)}</strong><i /></p>)}</div>}</div>)}</div></div></td></tr>;
}
function SalesLineChart({ rows }: { rows: Summary["daily"] }) {
  if (!rows.length) return <div className="empty">暂无趋势数据</div>;
  const first = new Date(rows[0].date), last = new Date(rows.at(-1)!.date);
  const useMonthly = (last.getTime() - first.getTime()) / 86400000 > 62;
  const chartRows = useMonthly ? [...rows.reduce((map, row) => { const key = row.date.slice(0, 7); const value = map.get(key) || { date: key, gmv: 0, gsv: 0, qty: 0, orders: 0 }; value.gmv += row.gmv; value.gsv += row.gsv; value.qty += row.qty; value.orders += row.orders; map.set(key, value); return map; }, new Map<string, Summary["daily"][number]>()).values()] : rows;
  const width = Math.max(1000, chartRows.length * (useMonthly ? 112 : 82)), height = 280, left = 58, right = 28, top = 48, bottom = 46;
  const max = Math.max(...chartRows.map((x) => x.gmv), 1), plotW = width-left-right, plotH = height-top-bottom;
  const points = chartRows.map((d,i) => ({ ...d, x:left+(chartRows.length===1?plotW/2:i*plotW/(chartRows.length-1)), y:top+(1-d.gmv/max)*plotH }));
  const path = points.map((p,i)=>`${i?"L":"M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return <div className="sales-line-chart"><div className="line-legend"><i/>销售金额 <small>{useMonthly ? "跨月范围已按月汇总；每月金额完整展示" : "每个日期金额完整展示，可左右滑动"}</small></div><div className="sales-line-scroll"><svg viewBox={`0 0 ${width} ${height}`} style={{width}}>{[0,.25,.5,.75,1].map((r)=><g key={r}><line x1={left} x2={width-right} y1={top+r*plotH} y2={top+r*plotH}/><text x={left-8} y={top+r*plotH+4}>{Math.round(max*(1-r)/10000)}万</text></g>)}<path className="line-area" d={`${path} L${points.at(-1)!.x},${top+plotH} L${points[0].x},${top+plotH} Z`}/><path className="line-path" d={path}/>{points.map((p,i)=><g className="line-point" key={p.date}><circle cx={p.x} cy={p.y} r="4"/><title>{`${p.date}：${money(p.gmv)}，${p.qty}台`}</title><text className="line-value" x={p.x} y={Math.max(16,p.y-(i%2===0?11:25))}>{p.gmv>=10000?`${(p.gmv/10000).toFixed(1)}万`:Math.round(p.gmv)}</text><text className="line-date" x={p.x} y={height-12}>{useMonthly ? p.date : p.date.slice(5).replace("-","/")}</text></g>)}</svg></div></div>;
}
function RealKpi({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="kpi-card real-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      <small className="up">{note}</small>
    </div>
  );
}
function RealHead({ title, action }: { title: string; action?: () => void }) {
  return (
    <div className="panel-head">
      <div>
        <h3>{title}</h3>
        <p>实时业务数据</p>
      </div>
      {action && (
        <button onClick={action}>
          <Download size={14} />
          导出
        </button>
      )}
    </div>
  );
}

export function TalentManager({ channel }: { channel: ChannelFilter }) {
  const [list, setList] = useState<Talent[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Partial<Talent> | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setList(
        await jsonFetch(
          `/api/talents?q=${encodeURIComponent(q)}&channel=${channel}`,
        ),
      );
      setLeaders(await jsonFetch(`/api/leaders?channel=${channel}`));
    } catch (e) {
      setError(String(e));
    }
  }, [q, channel]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  async function save(v: Partial<Talent>) {
    const edit = Boolean(v.id);
    await jsonFetch(edit ? `/api/talents/${v.id}` : "/api/talents", {
      method: edit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v),
    });
    setEditing(null);
    load();
  }
  async function remove(id: string) {
    if (!confirm("确定删除这位达人吗？")) return;
    await jsonFetch(`/api/talents/${id}`, { method: "DELETE" });
    load();
  }
  return (
    <>
      <ManagerTitle
        title="达人管理"
        desc="真实达人档案，可新增、编辑、搜索和删除"
        onAdd={() =>
          setEditing({
            cooperation_status: "合作中",
            tags: [],
            platform: channel === "all" ? null : channel,
          })
        }
      />
      <ManagerToolbar
        channel={channel}
        q={q}
        setQ={setQ}
        onExport={() => exportCsv("达人档案.csv", list)}
      />
      {error && <Notice text={error} />}
      <div className="panel table-panel">
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>达人昵称</th>
                <th>平台/账号</th>
                <th>所属团长</th>
                <th>地区</th>
                <th>联系方式</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id}>
                  <td>
                    <b>{t.name}</b>
                  </td>
                  <td>
                    {channelName(t.platform)} {t.platform_account || ""}
                  </td>
                  <td>{t.leaders?.name || "未分配"}</td>
                  <td>
                    {[t.province, t.city, t.district]
                      .filter(Boolean)
                      .join(" ") || "-"}
                  </td>
                  <td>{t.phone || t.wechat || "-"}</td>
                  <td>
                    <span className="tag">{t.cooperation_status}</span>
                  </td>
                  <td>
                    <RowActions
                      edit={() => setEditing(t)}
                      remove={() => remove(t.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && <Empty text="暂无达人档案，点击新增达人开始录入" />}
        </div>
      </div>
      {editing && (
        <TalentModal
          value={editing}
          leaders={leaders}
          close={() => setEditing(null)}
          save={save}
        />
      )}
    </>
  );
}

export function LeaderManager({ channel }: { channel: ChannelFilter }) {
  const [list, setList] = useState<Leader[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Partial<Leader> | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setList(
        await jsonFetch(
          `/api/leaders?q=${encodeURIComponent(q)}&channel=${channel}`,
        ),
      );
    } catch (e) {
      setError(String(e));
    }
  }, [q, channel]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  async function save(v: Partial<Leader>) {
    const edit = Boolean(v.id);
    await jsonFetch(edit ? `/api/leaders/${v.id}` : "/api/leaders", {
      method: edit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v),
    });
    setEditing(null);
    load();
  }
  async function remove(id: string) {
    if (!confirm("确定删除这位团长吗？")) return;
    await jsonFetch(`/api/leaders/${id}`, { method: "DELETE" });
    load();
  }
  return (
    <>
      <ManagerTitle
        title="团长管理"
        desc="维护团长机构、联系人和区域信息"
        onAdd={() =>
          setEditing({
            cooperation_status: "合作中",
            tags: [],
            platform: channel === "all" ? null : channel,
          })
        }
      />
      <ManagerToolbar
        channel={channel}
        q={q}
        setQ={setQ}
        onExport={() => exportCsv("团长档案.csv", list)}
      />
      {error && <Notice text={error} />}
      <div className="leader-grid">
        {list.map((l) => (
          <div className="leader-card" key={l.id}>
            <div className="leader-top">
              <div className="leader-logo">{l.name[0]}</div>
              <div>
                <h3>{l.name}</h3>
                <p>
                  <MapPin size={13} />
                  {l.city || "地区待补充"} · {l.contact_name || "联系人待补充"}
                </p>
              </div>
              <span>{l.cooperation_status}</span>
            </div>
            <div className="leader-info">
              <span>渠道：{channelName(l.platform)}</span>
              <span>电话：{l.phone || "-"}</span>
              <span>微信：{l.wechat || "-"}</span>
            </div>
            <div className="card-actions">
              <button onClick={() => setEditing(l)}>
                <Edit3 size={14} />
                编辑
              </button>
              <button className="danger" onClick={() => remove(l.id)}>
                <Trash2 size={14} />
                删除
              </button>
            </div>
          </div>
        ))}
        {!list.length && (
          <div className="panel">
            <Empty text="暂无团长档案，点击新增团长开始录入" />
          </div>
        )}
      </div>
      {editing && (
        <LeaderModal
          value={editing}
          close={() => setEditing(null)}
          save={save}
        />
      )}
    </>
  );
}

export function RealMap({ channel }: { channel: ChannelFilter }) {
  const [talents, setTalents] = useState<Talent[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [kind, setKind] = useState<"全部" | "达人" | "团长">("全部");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState("");
  useEffect(() => {
    if (!selected) return;
    document
      .querySelector(`[data-map-resource="${selected}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selected]);
  useEffect(() => {
    Promise.all([
      fetch(`/api/talents?channel=${channel}&map=1`, { cache: "no-store" }).then((r) => r.json()) as Promise<Talent[]>,
      fetch(`/api/leaders?channel=${channel}&map=1`, { cache: "no-store" }).then((r) => r.json()) as Promise<Leader[]>,
    ])
      .then(([t, l]) => {
        setTalents(t);
        setLeaders(l);
      })
      .catch(() => {});
  }, [channel]);
  const located: MapResource[] = useMemo(
    () =>
      [
        ...talents.map((x) => ({
          id: `talent-${x.id}`,
          type: "达人",
          name: x.name,
          channel: x.platform,
          province: x.province,
          city: x.city,
          district: x.district,
          address: x.address,
          longitude: x.longitude,
          latitude: x.latitude,
        })),
        ...leaders.map((x) => ({
          id: `leader-${x.id}`,
          type: "团长",
          name: x.name,
          channel: x.platform,
          province: x.province,
          city: x.city,
          district: x.district,
          address: x.address,
          longitude: x.longitude,
          latitude: x.latitude,
        })),
      ].filter(
        (x): x is MapResource =>
          Boolean(
            x.province || x.city || x.district || x.address || (x.longitude != null && x.latitude != null),
          ) &&
          (kind === "全部" || x.type === kind) &&
          (!q ||
            `${x.name}${x.province || ""}${x.city || ""}${x.district || ""}${x.address || ""}`
              .toLowerCase()
              .includes(q.toLowerCase())),
      ),
    [talents, leaders, kind, q],
  );
  return (
    <>
      <ManagerTitle
        title={`地图中心 · ${channel === "all" ? "全部渠道" : channelName(channel)}`}
        desc="真实全国地图、资源聚合与位置检索"
      />
      <div className="map-layout">
        <div className="map-panel">
          <div className="map-toolbar">
            <div className="segment">
              {(["全部", "达人", "团长"] as const).map((value) => (
                <button
                  key={value}
                  className={kind === value ? "active" : ""}
                  onClick={() => setKind(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <span>{located.length} 个可定位资源</span>
          </div>
          <AmapMap
            resources={located}
            onSelect={setSelected}
            selectedId={selected}
          />
        </div>
        <div className="map-list">
          <div className="map-list-head">
            <h3>已定位资源</h3>
            <span>{located.length}个</span>
          </div>
          <div className="map-search">
            <Search size={16} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索姓名、城市或地址"
            />
          </div>
          {located.map((x, i) => (
            <div
              className={`map-person ${selected === x.id ? "selected" : ""}`}
              key={x.id}
              data-map-resource={x.id}
              onClick={() => setSelected(x.id)}
            >
              <div className={`talent-avatar a${i % 5}`}>{x.name[0]}</div>
              <p>
                <b>{x.name}</b>
                <span>
                  <MapPin size={12} />
                  {[x.province, x.city, x.district, x.address]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <small>
                  {x.type} · {channelName(x.channel)}
                </small>
              </p>
            </div>
          ))}
          {!located.length && <Empty text="请先在达人或团长档案中填写城市" />}
        </div>
      </div>
    </>
  );
}

function ManagerTitle({
  title,
  desc,
  onAdd,
}: {
  title: string;
  desc: string;
  onAdd?: () => void;
}) {
  return (
    <div className="page-title">
      <div>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
      {onAdd && (
        <button className="primary" onClick={onAdd}>
          <Plus size={15} />
          新增{title.slice(0, 2)}
        </button>
      )}
    </div>
  );
}
function ManagerToolbar({
  channel,
  q,
  setQ,
  onExport,
}: {
  channel: ChannelFilter;
  q: string;
  setQ: (v: string) => void;
  onExport: () => void;
}) {
  return (
    <div className="filters real-filter">
      <div className="filter-search">
        <Search size={16} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="输入名称搜索"
        />
      </div>
      <span className="channel-badge">
        {channel === "all" ? "全部渠道" : channelName(channel)}
      </span>
      <button onClick={onExport}>
        <Download size={15} />
        导出CSV
      </button>
    </div>
  );
}
function RowActions({
  edit,
  remove,
}: {
  edit: () => void;
  remove: () => void;
}) {
  return (
    <div className="row-actions">
      <button type="button" onClick={edit} aria-label="编辑">
        <Edit3 size={14} />
      </button>
      <button type="button" className="danger" onClick={remove} aria-label="删除">
        <Trash2 size={14} />
      </button>
    </div>
  );
}
function TalentModal({
  value,
  leaders,
  close,
  save,
}: {
  value: Partial<Talent>;
  leaders: Leader[];
  close: () => void;
  save: (v: Partial<Talent>) => Promise<void>;
}) {
  const [v, setV] = useState(value);
  return (
    <Modal
      title={v.id ? "编辑达人" : "新增达人"}
      close={close}
      submit={() => save(v)}
    >
      <FormInput
        label="达人昵称*"
        value={v.name}
        set={(x) => setV({ ...v, name: x })}
      />
      <FormInput label="京东匹配ID（联盟ID）" value={v.match_id} set={(x) => setV({ ...v, match_id: x })} />
      <FormSelect
        label="所属渠道*"
        value={v.platform}
        set={(x) => setV({ ...v, platform: x })}
        options={CHANNELS.map((c) => [c.code, c.name])}
      />
      <FormInput
        label="平台账号"
        value={v.platform_account}
        set={(x) => setV({ ...v, platform_account: x })}
      />
      <FormSelect
        label="所属团长"
        value={v.leader_id}
        set={(x) => setV({ ...v, leader_id: x })}
        options={leaders.map((l) => [l.id, l.name])}
      />
      <FormInput
        label="手机号"
        value={v.phone}
        set={(x) => setV({ ...v, phone: x })}
      />
      <FormInput
        label="微信"
        value={v.wechat}
        set={(x) => setV({ ...v, wechat: x })}
      />
      <FormInput
        label="省"
        value={v.province}
        set={(x) => setV({ ...v, province: x })}
      />
      <FormInput
        label="城市"
        value={v.city}
        set={(x) => setV({ ...v, city: x })}
      />
      <FormInput
        label="区/县"
        value={v.district}
        set={(x) => setV({ ...v, district: x })}
      />
      <FormInput
        label="详细地址"
        value={v.address}
        set={(x) => setV({ ...v, address: x })}
      />
      <FormSelect
        label="合作状态"
        value={v.cooperation_status}
        set={(x) => setV({ ...v, cooperation_status: x })}
        options={[
          ["合作中", "合作中"],
          ["重点跟进", "重点跟进"],
          ["暂停合作", "暂停合作"],
        ]}
      />
    </Modal>
  );
}
function LeaderModal({
  value,
  close,
  save,
}: {
  value: Partial<Leader>;
  close: () => void;
  save: (v: Partial<Leader>) => Promise<void>;
}) {
  const [v, setV] = useState(value);
  return (
    <Modal
      title={v.id ? "编辑团长" : "新增团长"}
      close={close}
      submit={() => save(v)}
    >
      <FormInput
        label="团长/机构名称*"
        value={v.name}
        set={(x) => setV({ ...v, name: x })}
      />
      <FormInput
        label="联系人"
        value={v.contact_name}
        set={(x) => setV({ ...v, contact_name: x })}
      />
      <FormSelect
        label="所属渠道*"
        value={v.platform}
        set={(x) => setV({ ...v, platform: x })}
        options={CHANNELS.map((c) => [c.code, c.name])}
      />
      <FormInput
        label="手机号"
        value={v.phone}
        set={(x) => setV({ ...v, phone: x })}
      />
      <FormInput
        label="微信"
        value={v.wechat}
        set={(x) => setV({ ...v, wechat: x })}
      />
      <FormInput
        label="省"
        value={v.province}
        set={(x) => setV({ ...v, province: x })}
      />
      <FormInput
        label="城市"
        value={v.city}
        set={(x) => setV({ ...v, city: x })}
      />
      <FormInput
        label="区/县"
        value={v.district}
        set={(x) => setV({ ...v, district: x })}
      />
      <FormInput
        label="详细地址"
        value={v.address}
        set={(x) => setV({ ...v, address: x })}
      />
      <FormSelect
        label="合作状态"
        value={v.cooperation_status}
        set={(x) => setV({ ...v, cooperation_status: x })}
        options={[
          ["合作中", "合作中"],
          ["重点跟进", "重点跟进"],
          ["暂停合作", "暂停合作"],
        ]}
      />
    </Modal>
  );
}
function Modal({
  title,
  close,
  submit,
  children,
}: {
  title: string;
  close: () => void;
  submit: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const closeRef = useRef(close);
  const titleId = useId();
  closeRef.current = close;
  async function go() {
    setSaving(true);
    setError("");
    try {
      await submit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }
  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      window.requestAnimationFrame(() => previousFocus.current?.focus());
    };
  }, []);
  const handleBackdropMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) close();
  };
  return (
    <div className="modal-backdrop" onMouseDown={handleBackdropMouseDown}>
      <div ref={modalRef} className="form-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-head">
          <h3 id={titleId}>{title}</h3>
          <button ref={closeButtonRef} type="button" onClick={close} aria-label={`关闭${title}`}>
            <X size={18} />
          </button>
        </div>
        <div className="form-grid">{children}</div>
        {error && <Notice text={error} />}
        <div className="modal-actions">
          <button onClick={close}>取消</button>
          <button className="primary" onClick={go} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
function FormInput({
  label,
  value,
  set,
}: {
  label: string;
  value: unknown;
  set: (v: string) => void;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        value={String(value ?? "")}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );
}
function FormSelect({
  label,
  value,
  set,
  options,
}: {
  label: string;
  value: unknown;
  set: (v: string) => void;
  options: string[][];
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <select value={String(value ?? "")} onChange={(e) => set(e.target.value)}>
        <option value="">请选择</option>
        {options.map(([v, n]) => (
          <option key={v} value={v}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}
function Loading() {
  return (
    <div className="loading">
      <RefreshCw size={22} />
      正在读取真实数据…
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}
function Notice({ text }: { text: string }) {
  return <div className="notice">{text}</div>;
}
function hash(s: string) {
  return Math.abs([...s].reduce((a, c) => (a << 5) - a + c.charCodeAt(0), 0));
}
function exportCsv<T extends object>(name: string, rows: T[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv =
    "\ufeff" +
    [
      keys.join(","),
      ...rows.map((row) => {
        const r = row as Record<string, unknown>;
        return keys
          .map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`)
          .join(",");
      }),
    ].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
