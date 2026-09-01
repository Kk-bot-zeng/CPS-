"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Boxes,
  ChevronDown,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  LayoutDashboard,
  MapPinned,
  Menu,
  Search,
  Settings,
  Sparkles,
  UploadCloud,
  UserRound,
  UsersRound,
  X,
  Zap,
  Bell,
  ArrowUpRight,
  ArrowDownRight,
  MapPin,
  Phone,
  Radio,
  CheckCircle2,
  AlertCircle,
  Clock3,
  LogOut,
  Trash2,
  Siren,
  MonitorPlay,
  FileText,
  RefreshCw,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  LeaderManager,
  RealMap,
  RealOverview,
  TalentManager,
} from "@/components/real-pages";
import { CHANNELS, channelName, type ChannelFilter } from "@/lib/channels";
import ResourceManager from "@/components/resource-manager";
import JdSyncCard from "@/components/jd-sync-card";
import BusinessSelect from "@/components/business-select";
import { parseSpreadsheet } from "@/lib/parse-spreadsheet";
import SalesWarningPage, { WarningPopup, acknowledgeWarnings, loadWarnings, type WarningPayload } from "@/components/sales-warning-page";
import ProductKnowledgeWorkspace from "@/components/product-knowledge-workspace";

type Page = "总览" | "B站操盘看板" | "达人/团长管理" | "数据导入" | "动销预警" | "地图中心" | "文案生成";
type ProductCategory = "tv" | "monitor";
type Order = {
  sourceKey: string;
  orderNo: string;
  productId: string;
  merchantCode: string;
  qty: number;
  paidAt: string;
  status: string;
  amount: number;
  talent: string;
  product: string;
  model: string;
};
type ImportJob = {
  id: string;
  channel: string;
  file_name: string;
  status: string;
  total_rows: number;
  created_at: string;
  completed_at: string | null;
  product_category?: ProductCategory;
};

const nav: { label: Page; icon: React.ElementType }[] = [
  { label: "总览", icon: LayoutDashboard },
  { label: "B站操盘看板", icon: MonitorPlay },
  { label: "达人/团长管理", icon: UsersRound },
  { label: "数据导入", icon: FileSpreadsheet },
  { label: "动销预警", icon: Siren },
  { label: "地图中心", icon: MapPinned },
  { label: "文案生成", icon: FileText },
];

const talents = [
  {
    name: "文哥聊装修",
    leader: "文哥家电团",
    city: "杭州",
    amount: 265.8,
    gsv: 189.4,
    orders: 386,
    trend: 18.2,
    tag: "头部达人",
  },
  {
    name: "老板娘聊家电",
    leader: "万家榜",
    city: "武汉",
    amount: 228.4,
    gsv: 164.1,
    orders: 341,
    trend: 12.6,
    tag: "重点维护",
  },
  {
    name: "跟着茵茵选家电",
    leader: "茵茵选品团",
    city: "成都",
    amount: 196.2,
    gsv: 143.7,
    orders: 298,
    trend: 7.9,
    tag: "潜力达人",
  },
  {
    name: "柳老师家电团",
    leader: "柳老师家电团",
    city: "郑州",
    amount: 172.5,
    gsv: 126.3,
    orders: 253,
    trend: -2.4,
    tag: "稳定合作",
  },
  {
    name: "晶晶说家电",
    leader: "星选联盟",
    city: "长沙",
    amount: 148.9,
    gsv: 97.6,
    orders: 211,
    trend: 21.5,
    tag: "增长达人",
  },
];

const leaders = [
  {
    name: "文哥家电团",
    owner: "成成",
    city: "杭州",
    talents: 28,
    active: 19,
    gmv: 526.8,
    rate: 74.2,
    status: "合作中",
  },
  {
    name: "万家榜",
    owner: "张明",
    city: "武汉",
    talents: 35,
    active: 22,
    gmv: 468.3,
    rate: 69.8,
    status: "合作中",
  },
  {
    name: "茵茵选品团",
    owner: "茵茵",
    city: "成都",
    talents: 18,
    active: 14,
    gmv: 352.6,
    rate: 76.1,
    status: "重点跟进",
  },
  {
    name: "星选联盟",
    owner: "周宁",
    city: "长沙",
    talents: 21,
    active: 12,
    gmv: 286.4,
    rate: 65.5,
    status: "合作中",
  },
];

const products = [
  { name: "鹤7 Pro 26款", amount: 386.2, qty: 726, talents: 84, share: 92 },
  { name: "鹤7 25款 Plus", amount: 328.7, qty: 642, talents: 72, share: 78 },
  { name: "鹤6 Ultra 26款", amount: 296.1, qty: 581, talents: 69, share: 70 },
  { name: "鹤7 Pro 25款", amount: 237.8, qty: 456, talents: 58, share: 56 },
  { name: "鹤6 26款", amount: 191.4, qty: 398, talents: 47, share: 45 },
];

export default function DashboardApp() {
  const [page, setPage] = useState<Page>("总览");
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState<"GMV" | "GSV">("GMV");
  const [orders, setOrders] = useState<Order[]>([]);
  const [uploading, setUploading] = useState(false);
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [category, setCategory] = useState<ProductCategory>("tv");
  const categoryPage = page === "总览" || page === "数据导入" || page === "B站操盘看板" || page === "达人/团长管理" || page === "文案生成";
  const effectiveChannel: ChannelFilter = category === "monitor" && (page === "总览" || page === "数据导入" || page === "达人/团长管理") ? "jd" : channel;
  const [warningData, setWarningData] = useState<WarningPayload | null>(null);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const refreshWarnings = () => loadWarnings("all").then(setWarningData).catch(() => {});
  useEffect(() => { void refreshWarnings(); const timer=window.setInterval(refreshWarnings,5*60_000); return()=>window.clearInterval(timer); }, []);
  async function viewWarnings() {
    const keys=warningData?.rows.filter(x=>x.unread).map(x=>x.resource_key)||[];
    await acknowledgeWarnings(keys); setWarningDismissed(true); setPage("动销预警");
    setWarningData(x=>x?{...x,unreadCount:0,rows:x.rows.map(r=>({...r,unread:false}))}:x);
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="brand">
          <img className={collapsed ? "brand-symbol" : "brand-logo"} src={collapsed ? "/brand/ffalcon-symbol.png" : "/brand/ffalcon-horizontal.png"} alt="FFALCON 雷鸟" />
          {!collapsed && <span className="brand-system-name">CPS 经营管理系统</span>}
        </div>
        <button className="collapse" onClick={() => setCollapsed(!collapsed)}>
          <Menu size={18} />
        </button>
        <nav>
          {nav.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={page === label ? "active" : ""}
              onClick={() => {
                setPage(label);
                if (label === "B站操盘看板") setCategory("monitor");
              }}
            >
              <Icon size={19} />
              {!collapsed && <span>{label}</span>}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <button onClick={logout}>
            <LogOut size={19} />
            {!collapsed && <span>退出登录</span>}
          </button>
          {!collapsed && <div className="version">Thunderbird CPS · v0.3</div>}
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="top-actions">
            {categoryPage && <BusinessSelect className="category-business-select" label="当前品类" value={category} onChange={(value) => setCategory(value as ProductCategory)} options={[{ value:"tv", label:"TV" }, { value:"monitor", label:"显示器" }]} />}
            {page !== "B站操盘看板" && <BusinessSelect className="channel-business-select" label="当前渠道" value={effectiveChannel} onChange={(value) => setChannel(value as ChannelFilter)} options={category === "monitor" && (page === "总览" || page === "数据导入" || page === "达人/团长管理") ? [{ value:"jd", label:"京东" }] : [{ value:"all", label:"全部渠道" }, ...CHANNELS.map((c) => ({ value:c.code, label:c.name }))]} />}
            <div className="global-search">
              <Search size={17} />
              <input placeholder="搜索达人、团长或商品" />
            </div>
            <button className="icon-btn" onClick={viewWarnings} aria-label="动销预警">
              <Bell size={19} />
              {!!warningData?.unreadCount && <i />}
            </button>
            <div className="avatar">雷</div>
            <div className="user">
              <b>运营管理员</b>
              <span>超级管理员</span>
            </div>
            <ChevronDown size={16} />
          </div>
        </header>
        <section className="content">
          {page === "总览" && <RealOverview channel={effectiveChannel} category={category} />}
          <div className="bilibili-page-host" hidden={page !== "B站操盘看板"}>
            <BilibiliDashboard category={category} />
          </div>
          {page === "达人/团长管理" && <ResourceManager channel={effectiveChannel} category={category} />}
          {page === "数据导入" && (
            <ImportPage
              channel={effectiveChannel}
              category={category}
              orders={orders}
              setOrders={setOrders}
              uploading={uploading}
              setUploading={setUploading}
            />
          )}
          {page === "动销预警" && <SalesWarningPage channel={channel} onRead={refreshWarnings} />}
          {page === "地图中心" && <RealMap channel={channel} />}
          {page === "文案生成" && <ProductKnowledgeWorkspace channel={effectiveChannel} category={category} />}
        </section>
      </main>
      {!warningDismissed && warningData && <WarningPopup data={warningData} onView={viewWarnings} />}
    </div>
  );
}

function BilibiliDashboard({ category }: { category: ProductCategory }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState(1100);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === "monitor-dashboard-height") {
        setFrameHeight(Math.max(760, Number(event.data.height) || 0));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return <>
    {category === "tv" && <div className="monitor-dashboard-shell bilibili-empty">
      <div className="monitor-dashboard-head"><div><h2>TV · B站操盘看板</h2><p>TV与显示器数据源相互隔离</p></div><span>等待接入TV的B站数据源</span></div>
      <div className="empty-category-state"><MonitorPlay size={44}/><h3>暂无TV品类的B站交接数据</h3><p>当前交接包只包含显示器数据；后续接入TV数据后将在这里按相同模式展示。</p></div>
    </div>}
    <div className="monitor-dashboard-shell" hidden={category !== "monitor"}>
      <div className="monitor-dashboard-head"><div><h2>显示器 · B站操盘看板</h2><p>完整保留显示器原看板的数据口径、分析方式与下钻模式</p></div><span>数据截至 2026-08-13</span></div>
      <iframe ref={frameRef} className="monitor-dashboard-frame" src="/monitor-dashboard/" title="显示器CPS达人全链路操盘看板" scrolling="no" style={{height:frameHeight}} />
    </div>
  </>;
}

function Overview({
  mode,
  setMode,
}: {
  mode: "GMV" | "GSV";
  setMode: (v: "GMV" | "GSV") => void;
}) {
  const kpis: [string, string, string, boolean, React.ElementType][] =
    mode === "GMV"
      ? [
          ["总 GMV", "¥1.73亿", "较上期 +16.8%", true, CircleDollarSign],
          ["总 GSV", "¥2,858.72万", "有效率 16.5%", true, CheckCircle2],
          ["订单数量", "24,855", "有效订单 5,718", true, Boxes],
          ["活跃达人", "159", "新增 12 位", true, UsersRound],
        ]
      : [
          ["有效销售额", "¥2,858.72万", "较上期 +9.6%", true, CheckCircle2],
          ["有效订单", "5,718", "占全部 23.0%", true, Boxes],
          ["活跃达人", "128", "有效出单达人", true, UsersRound],
          ["平均客单价", "¥4,999", "较上期 -1.3%", false, CircleDollarSign],
        ];
  return (
    <>
      <div className="hero-banner">
        <div>
          <span>
            <Sparkles size={15} /> 经营数据中心
          </span>
          <h2>让每一次达人合作，都有数据可循</h2>
          <p>销售表现、达人效率与区域分布一站式掌握</p>
        </div>
        <div className="hero-orb">
          <BarChart3 size={50} />
        </div>
      </div>
      <div className="toolbar">
        <div className="segment">
          <button
            className={mode === "GMV" ? "active" : ""}
            onClick={() => setMode("GMV")}
          >
            GMV 全部订单
          </button>
          <button
            className={mode === "GSV" ? "active gsv" : ""}
            onClick={() => setMode("GSV")}
          >
            GSV 有效订单
          </button>
        </div>
        <div className="date-pill">
          <Clock3 size={16} /> 2026-01-01 — 2026-06-29 <ChevronDown size={15} />
        </div>
        <button className="primary">
          <Download size={16} /> 导出报告
        </button>
      </div>
      <div className="kpi-grid">
        {kpis.map(([label, value, sub, up, Icon], i) => (
          <div className="kpi-card" key={String(label)}>
            <div className={`kpi-icon i${i}`}>
              <Icon size={21} />
            </div>
            <span>{String(label)}</span>
            <strong>{String(value)}</strong>
            <small className={up ? "up" : "down"}>
              {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{" "}
              {String(sub)}
            </small>
            <div className="kpi-spark">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <div className="panel wide">
          <PanelHead title="销售趋势" note="按日统计 GMV 与 GSV" />
          <TrendChart />
        </div>
        <div className="panel">
          <PanelHead title="订单质量" note="GMV → GSV 转化" />
          <Donut />
          <div className="legend">
            <span>
              <i className="dot green" />
              有效订单 23.0%
            </span>
            <span>
              <i className="dot red" />
              关闭订单 77.0%
            </span>
          </div>
        </div>
        <div className="panel wide">
          <PanelHead
            title="达人销售排行榜"
            note="按销售金额排序"
            action="查看全部"
          />
          <TalentTable compact />
        </div>
        <div className="panel">
          <PanelHead title="实时动态" note="最近业务变化" />
          <Activity />
        </div>
      </div>
    </>
  );
}

function PanelHead({
  title,
  note,
  action,
}: {
  title: string;
  note: string;
  action?: string;
}) {
  return (
    <div className="panel-head">
      <div>
        <h3>{title}</h3>
        <p>{note}</p>
      </div>
      {action && (
        <button>
          {action} <ArrowUpRight size={14} />
        </button>
      )}
    </div>
  );
}
function TrendChart() {
  const points =
    "0,142 55,126 110,136 165,98 220,112 275,67 330,82 385,43 440,64 495,22 550,49 605,18";
  const points2 =
    "0,170 55,164 110,168 165,150 220,157 275,132 330,141 385,119 440,132 495,104 550,116 605,96";
  return (
    <div className="trend">
      <div className="chart-legend">
        <span>
          <i className="dot purple" />
          GMV
        </span>
        <span>
          <i className="dot green" />
          GSV
        </span>
      </div>
      <svg viewBox="0 0 605 190" preserveAspectRatio="none">
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6657e8" stopOpacity=".28" />
            <stop offset="1" stopColor="#6657e8" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`M${points} L605,190 L0,190Z`} fill="url(#area)" />
        <polyline
          points={points}
          fill="none"
          stroke="#6657e8"
          strokeWidth="4"
        />
        <polyline
          points={points2}
          fill="none"
          stroke="#14b88a"
          strokeWidth="3"
          strokeDasharray="7 6"
        />
      </svg>
      <div className="axis">
        <span>1月</span>
        <span>2月</span>
        <span>3月</span>
        <span>4月</span>
        <span>5月</span>
        <span>6月</span>
      </div>
    </div>
  );
}
function Donut() {
  return (
    <div className="donut">
      <div>
        <strong>16.5%</strong>
        <span>金额有效率</span>
      </div>
    </div>
  );
}
function Activity() {
  const items: [React.ElementType, string, string, string][] = [
    [UploadCloud, "订单数据导入完成", "新增 2,846 条订单", "2分钟前"],
    [UserRound, "新增达人档案", "跟着小鹿选家电", "18分钟前"],
    [AlertCircle, "发现商品映射异常", "21条订单待处理", "1小时前"],
    [MapPin, "达人位置已更新", "成都 · 武侯区", "3小时前"],
  ];
  return (
    <div className="activity">
      {items.map(([Icon, t, d, time]) => (
        <div key={t}>
          <span className="act-icon">
            <Icon size={17} />
          </span>
          <p>
            <b>{t}</b>
            <small>{d}</small>
          </p>
          <time>{time}</time>
        </div>
      ))}
    </div>
  );
}

function TalentPage() {
  return (
    <PageFrame
      title="达人档案"
      desc="管理达人资料、合作关系与销售表现"
      button="新增达人"
    >
      <div className="mini-kpis">
        <Mini label="达人总数" value="160" note="本月新增 12" />
        <Mini label="活跃达人" value="128" note="活跃率 80.0%" />
        <Mini label="头部达人" value="26" note="贡献 62.4% GMV" />
        <Mini label="待跟进" value="18" note="7天未联系" />
      </div>
      <div className="panel table-panel">
        <Filters placeholder="搜索达人昵称、平台账号" />
        <TalentTable />
      </div>
    </PageFrame>
  );
}
function TalentTable({ compact = false }: { compact?: boolean }) {
  return (
    <div className="data-table">
      <table>
        <thead>
          <tr>
            <th>达人</th>
            <th>所属团长</th>
            {!compact && <th>地区</th>}
            <th>GMV</th>
            <th>GSV</th>
            <th>订单</th>
            <th>趋势</th>
            {!compact && <th>标签</th>}
          </tr>
        </thead>
        <tbody>
          {talents.map((t, i) => (
            <tr key={t.name}>
              <td>
                <div className={`talent-avatar a${i}`}>
                  {t.name.slice(0, 1)}
                </div>
                <b>{t.name}</b>
              </td>
              <td>{t.leader}</td>
              {!compact && (
                <td>
                  <MapPin size={14} />
                  {t.city}
                </td>
              )}
              <td>
                <strong>¥{t.amount}万</strong>
              </td>
              <td>¥{t.gsv}万</td>
              <td>{t.orders}</td>
              <td className={t.trend > 0 ? "positive" : "negative"}>
                {t.trend > 0 ? "+" : ""}
                {t.trend}%
              </td>
              {!compact && (
                <td>
                  <span className="tag">{t.tag}</span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeaderPage() {
  return (
    <PageFrame
      title="团长管理"
      desc="维护团长关系，洞察旗下达人产出"
      button="新增团长"
    >
      <div className="mini-kpis">
        <Mini label="合作团长" value="46" note="覆盖 21 个城市" />
        <Mini label="旗下达人" value="160" note="人均 3.5 位" />
        <Mini label="本月GMV" value="¥2,846万" note="环比 +12.8%" />
        <Mini label="待跟进团长" value="7" note="建议本周联系" />
      </div>
      <div className="leader-grid">
        {leaders.map((l, i) => (
          <div className="leader-card" key={l.name}>
            <div className="leader-top">
              <div className={`leader-logo l${i}`}>{l.name[0]}</div>
              <div>
                <h3>{l.name}</h3>
                <p>
                  <MapPin size={13} />
                  {l.city} · 联系人 {l.owner}
                </p>
              </div>
              <span>{l.status}</span>
            </div>
            <div className="leader-stats">
              <div>
                <b>{l.talents}</b>
                <small>旗下达人</small>
              </div>
              <div>
                <b>{l.active}</b>
                <small>活跃达人</small>
              </div>
              <div>
                <b>¥{l.gmv}万</b>
                <small>累计GMV</small>
              </div>
            </div>
            <div className="rate">
              <span>
                订单有效率 <b>{l.rate}%</b>
              </span>
              <i>
                <em style={{ width: `${l.rate}%` }} />
              </i>
            </div>
            <button>
              查看团长详情 <ArrowUpRight size={15} />
            </button>
          </div>
        ))}
      </div>
    </PageFrame>
  );
}

function ProductPage() {
  return (
    <PageFrame
      title="商品分析"
      desc="从型号、尺寸和达人维度分析销售表现"
      button="导出商品报告"
    >
      <div className="panel">
        <PanelHead title="型号销售排行" note="鹤系列电视 · GMV口径" />
        <div className="product-list">
          {products.map((p, i) => (
            <div key={p.name}>
              <span className={`rank r${i}`}>{i + 1}</span>
              <p>
                <b>{p.name}</b>
                <small>
                  {p.talents} 位达人带货 · {p.qty} 件
                </small>
              </p>
              <div className="product-bar">
                <i style={{ width: `${p.share}%` }} />
              </div>
              <strong>¥{p.amount}万</strong>
            </div>
          ))}
        </div>
      </div>
    </PageFrame>
  );
}

function ImportPage({
  channel,
  category,
  orders,
  setOrders,
  uploading,
  setUploading,
}: {
  channel: ChannelFilter;
  category: ProductCategory;
  orders: Order[];
  setOrders: (x: Order[]) => void;
  uploading: boolean;
  setUploading: (x: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const mappingInput = useRef<HTMLInputElement>(null);
  const planInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [mappingStatus, setMappingStatus] = useState("正在读取匹配表状态…");
  const [mappingSaving, setMappingSaving] = useState(false);
  const [planStatus, setPlanStatus] = useState("请选择京东渠道后上传计划白名单");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saveMessage, setSaveMessage] = useState("");
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");
  useEffect(() => { setOrders([]); setFileName(""); setSaveMessage(""); }, [category, channel, setOrders]);
  async function loadJobs(nextChannel: ChannelFilter = channel) {
    setJobsLoading(true);
    try {
      const response = await fetch(`/api/import-jobs?channel=${nextChannel}&category=${category}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "读取导入历史失败");
      setJobs(result);
      setSelectedJobs([]);
    } catch (error) {
      setDeleteMessage(
        error instanceof Error ? error.message : "读取导入历史失败",
      );
    } finally {
      setJobsLoading(false);
    }
  }
  useEffect(() => {
    void loadJobs();
  }, [channel, category]);
  useEffect(() => {
    if (channel !== "jd") { setPlanStatus(channel === "all" ? "请选择京东渠道" : "计划白名单仅用于京东"); return; }
    fetch(`/api/plan-whitelist?channel=jd&category=${category}`).then(r=>r.json()).then(x=>setPlanStatus(x?.file_name ? `当前：${x.file_name}（${x.row_count}条）` : "尚未上传京东计划白名单")).catch(()=>setPlanStatus("计划白名单读取失败"));
  }, [channel, category]);
  function downloadTemplate(kind: "plan" | "sku") {
    const isMonitor=category === "monitor";
    const rows = kind === "plan" ? [{ "计划名称": isMonitor ? "示例：显示器推广计划" : "示例：TV推广计划" }] : isMonitor
      ? [{ "SKU": "100000000000", "推广名": "示例：雷鸟显示器", "型号": "示例：Q8", "是否计入显示器销量": "是" }]
      : [{ "SKU": "100000000000", "推广名": "示例：雷鸟电视", "型号": "示例：鹤系列", "是否计入TV销量": "是" }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), kind === "plan" ? "计划白名单" : `${isMonitor?"显示器":"TV"}SKU商品映射`); XLSX.writeFile(wb, kind === "plan" ? `${isMonitor?"显示器":"TV"}_京东计划白名单模板.xlsx` : `${isMonitor?"显示器":"TV"}_SKU商品映射模板.xlsx`);
  }
  async function loadPlans(file: File) { try { const rows=await parseSpreadsheet(file); const plans=rows.map(r=>String(r["计划名称"]??r["所属计划/活动"]??"").trim()).filter(Boolean); const res=await fetch("/api/plan-whitelist",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({channel:"jd",category,fileName:file.name,plans})}); const x=await res.json(); if(!res.ok) throw new Error(x.error); setPlanStatus(`已生效：${file.name}（${x.rowCount}条）`); } catch(e){setPlanStatus(e instanceof Error?e.message:"上传失败");} }
  useEffect(() => {
    if (channel === "all") {
      setMappingStatus("请先选择渠道");
      return;
    }
    fetch(`/api/product-mappings?channel=${channel}&category=${category}`)
      .then((r) => r.json())
      .then((x) => setMappingStatus(x?.file_name ? `当前：${x.file_name}（${x.row_count}条）` : "尚未上传商品匹配表"))
      .catch(() => setMappingStatus("匹配表状态读取失败"));
  }, [channel, category]);
  const summary = useMemo(
    () => ({
      rows: orders.length,
      amount: orders.reduce((s, o) => s + o.amount, 0),
      talents: new Set(orders.map((o) => o.talent)).size,
      errors: orders.filter((o) => !o.product).length,
    }),
    [orders],
  );
  async function load(file: File) {
    if (channel === "all") {
      setSaveMessage("请先选择本次导入所属渠道");
      return;
    }
    setUploading(true);
    setSaveMessage("");
    setFileName(file.name);
    try {
      const parsedOrders = await parseSpreadsheet<Order>(file, {
        preferredSheets: ["总表", "gmv"],
        mode: "orders",
        channel,
      });
      if (!parsedOrders.length) throw new Error(channel === "jd" ? "未识别到京东订单，请确认文件包含订单编号、商品编号、下单日期等字段" : "未识别到可导入的订单数据");
      setOrders(parsedOrders);
    } catch (error) {
      setOrders([]);
      setSaveMessage(error instanceof Error ? error.message : "订单文件解析失败");
    } finally {
      setUploading(false);
    }
  }
  async function loadMapping(file: File) {
    if (channel === "all") return setMappingStatus("请先选择渠道");
    setMappingSaving(true);
    setMappingStatus("正在解析并覆盖匹配表…");
    try {
      const rows = await parseSpreadsheet(file, { preferredSheets: ["数据底表"] });
      const mappings = rows.map((r) => ({
        promotionName: String(r["推广名"] ?? r["商品名称"] ?? "").trim(),
        modelName: String(r["型号"] ?? r["型号名"] ?? "").trim(),
        merchantCode: String(r["SKU"] ?? r["商品编码"] ?? "").trim(),
        countInSales: !["否","不计入","0","false"].includes(String(r["是否计入显示器销量"] ?? r["是否计入TV销量"] ?? r["计入电视销量"] ?? "是").trim().toLowerCase()),
      })).filter((r) => r.promotionName && r.merchantCode);
      const response = await fetch("/api/product-mappings", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, category, fileName: file.name, rows: mappings }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "匹配表上传失败");
      setMappingStatus(`当前：${file.name}（${result.rowCount}条），已覆盖旧匹配表`);
    } catch (error) {
      setMappingStatus(error instanceof Error ? error.message : "匹配表上传失败");
    } finally { setMappingSaving(false); }
  }
  async function saveToDatabase() {
    if (channel === "all") {
      setSaveMessage("请选择渠道后再导入");
      return;
    }
    setSaving(true);
    setProgress(0);
    setSaveMessage("");
    let jobId = "";
    let writtenRows = 0;
    try {
      const batchSize = 1000;
      const batches = Math.ceil(orders.length / batchSize);
      for (let i = 0; i < batches; i++) {
        const response = await fetch("/api/import-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel,
            category,
            orders: orders.slice(i * batchSize, (i + 1) * batchSize),
            importJobId: jobId || undefined,
            fileName,
            firstBatch: i === 0,
            finalBatch: i === batches - 1,
            totalRows: orders.length,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "写入失败");
        jobId = result.importJobId;
        writtenRows += Number(result.processed) || 0;
        setProgress(Math.round(((i + 1) / batches) * 100));
      }
      setSaveMessage(
        `已成功写入 ${writtenRows.toLocaleString()} 条订单${channel === "jd" ? "（已按有效订单、计划白名单、SKU及团长ID筛选）" : "，重复订单已自动更新"}`,
      );
      await loadJobs();
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "写入失败");
    } finally {
      setSaving(false);
    }
  }
  async function deleteSelectedJobs() {
    if (!selectedJobs.length) return;
    const rows = jobs
      .filter((job) => selectedJobs.includes(job.id))
      .reduce((sum, job) => sum + (job.total_rows || 0), 0);
    if (
      !confirm(
        `确认删除选中的 ${selectedJobs.length} 个导入批次及其关联订单吗？预计影响 ${rows.toLocaleString()} 条记录，此操作不可撤销。`,
      )
    )
      return;
    setJobsLoading(true);
    setDeleteMessage("");
    try {
      const response = await fetch("/api/import-jobs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedJobs }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "删除失败");
      setDeleteMessage(
        `已删除 ${result.deletedJobs} 个批次、${result.deletedOrders} 条关联订单`,
      );
      await loadJobs();
    } catch (error) {
      setDeleteMessage(error instanceof Error ? error.message : "删除失败");
      setJobsLoading(false);
    }
  }
  return (
    <PageFrame
      title="数据导入"
      desc="上传订单文件，系统将自动校验、去重并更新看板"
    >
      {channel === "jd" && category === "tv" && <JdSyncCard />}
      {channel === "jd" && category === "monitor" && <div className="import-category-note">当前为“显示器 · 京东”数据空间，导入的数据、SKU映射和计划白名单均与TV完全隔离。</div>}
      {channel === "all" && (
        <div className="import-channel-empty">
          请先从页面右上角选择京东、抖音或天猫渠道，再管理对应渠道的数据与匹配规则。
        </div>
      )}
      {channel !== "all" && <>
      <div className="mapping-upload-card">
        <div>
          <b className="channel-rule-title">{channel === "jd" ? "京东 SKU 商品映射" : channel === "douyin" ? "抖音商品型号匹配表" : channel === "tmall" ? "天猫商品型号匹配表" : "请先在顶部选择渠道"}</b>
          <span>{mappingStatus}</span>
          <small>读取SKU、推广名、型号及“是否计入{category === "monitor" ? "显示器" : "TV"}销量”；上传新文件会覆盖当前版本。</small>
        </div>
        <input ref={mappingInput} type="file" accept=".xlsx,.xls" hidden
          onChange={(e) => e.target.files?.[0] && loadMapping(e.target.files[0])} />
        <div className="mapping-actions">
          <button className="secondary-rule" onClick={() => downloadTemplate("sku")}>下载模板</button>
          <button disabled={mappingSaving} onClick={() => mappingInput.current?.click()}>
            {mappingSaving ? "上传中…" : "上传/更新"}
          </button>
        </div>
      </div>
      {channel === "jd" && <div className="mapping-upload-card"><div><b>京东计划白名单</b><span>{planStatus}</span><small>仅名单内计划会进入京东同步结果；上传新表覆盖旧表。</small></div><input ref={planInput} type="file" accept=".xlsx,.xls" hidden onChange={(e)=>e.target.files?.[0]&&loadPlans(e.target.files[0])}/><div className="mapping-actions"><button className="secondary-rule" onClick={()=>downloadTemplate("plan")}>下载模板</button><button onClick={()=>planInput.current?.click()}>上传/更新</button></div></div>}
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xls,.csv"
        hidden
        onChange={(e) => e.target.files?.[0] && load(e.target.files[0])}
      />
      <div
        className={`upload-zone ${orders.length ? "has-data" : ""}`}
        onClick={() => input.current?.click()}
      >
        <div className="upload-icon">
          <UploadCloud size={30} />
        </div>
        <h3>
          {uploading
              ? "正在解析订单数据…"
              : orders.length
                ? `${channelName(channel)}文件解析完成`
                : "拖拽订单文件到这里，或点击上传"}
        </h3>
        <p>支持 Excel / CSV，自动识别 gmv、gsv 工作表，单文件建议不超过 50MB</p>
        <button className="primary">
          {orders.length ? "重新选择文件" : "选择订单文件"}
        </button>
      </div>
      {!orders.length && saveMessage && <div className="import-parse-message">{saveMessage}</div>}
      </>}
      {orders.length > 0 && (
        <>
          <div className="mini-kpis import-result">
            <Mini
              label="目标数据空间"
              value={`${category === "tv" ? "TV" : "显示器"} · ${channelName(channel)}`}
              note="本批数据按品类和渠道隔离"
            />
            <Mini
              label="识别订单"
              value={summary.rows.toLocaleString()}
              note="按渠道+订单号去重"
            />
            <Mini
              label="订单金额"
              value={
                summary.amount >= 100000000
                  ? `¥${(summary.amount / 100000000).toFixed(2)}亿`
                  : `¥${(summary.amount / 10000).toFixed(1)}万`
              }
              note="GMV口径"
            />
            <Mini
              label="识别达人"
              value={String(summary.talents)}
              note="等待匹配档案"
            />
          </div>
          <div className="import-save">
            <div>
              <b>确认导入{channelName(channel)}数据库</b>
              <span>{fileName} · 系统将按“渠道 + 订单号”自动新增或更新</span>
              {saving && (
                <i>
                  <em style={{ width: `${progress}%` }} />
                </i>
              )}
              {saveMessage && <small>{saveMessage}</small>}
            </div>
            <button
              className="primary"
              onClick={saveToDatabase}
              disabled={saving}
            >
              {saving ? `正在写入 ${progress}%` : "确认写入数据库"}
            </button>
          </div>
          <div className="panel table-panel">
            <PanelHead
              title={`${channelName(channel)}导入预览`}
              note="展示前5条订单"
            />
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>渠道</th>
                    <th>订单编号</th>
                    <th>支付时间</th>
                    <th>状态</th>
                    <th>达人</th>
                    <th>商品</th>
                    <th>金额</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 5).map((o) => (
                    <tr key={o.orderNo}>
                      <td>
                        <span className="tag">{channelName(channel)}</span>
                      </td>
                      <td>{o.orderNo}</td>
                      <td>{o.paidAt}</td>
                      <td>
                        <span className="tag">{o.status}</span>
                      </td>
                      <td>{o.talent}</td>
                      <td>{o.product || "待映射"}</td>
                      <td>¥{o.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <div className="panel import-history">
        <div className="panel-head">
          <div>
            <h3>导入历史</h3>
            <p>按批次管理数据，可多选后批量删除</p>
          </div>
          <button
            className="danger-action"
            onClick={deleteSelectedJobs}
            disabled={!selectedJobs.length || jobsLoading}
          >
            <Trash2 size={14} />
            删除所选（{selectedJobs.length}）
          </button>
        </div>
        {deleteMessage && <div className="notice">{deleteMessage}</div>}
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={
                      jobs.length > 0 && selectedJobs.length === jobs.length
                    }
                    onChange={(e) =>
                      setSelectedJobs(
                        e.target.checked ? jobs.map((j) => j.id) : [],
                      )
                    }
                  />
                </th>
                <th>渠道</th>
                <th>文件名</th>
                <th>数据行数</th>
                <th>状态</th>
                <th>导入时间</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedJobs.includes(job.id)}
                      onChange={(e) =>
                        setSelectedJobs((current) =>
                          e.target.checked
                            ? [...current, job.id]
                            : current.filter((id) => id !== job.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    <span className="tag">{channelName(job.channel)}</span>
                  </td>
                  <td>{job.file_name}</td>
                  <td>{job.total_rows.toLocaleString()}</td>
                  <td>{job.status === "completed" ? "已完成" : job.status}</td>
                  <td>{new Date(job.created_at).toLocaleString("zh-CN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {jobsLoading && <div className="empty">正在读取导入记录…</div>}
          {!jobsLoading && !jobs.length && (
            <div className="empty">暂无导入记录</div>
          )}
        </div>
      </div>
    </PageFrame>
  );
}

function MapPage() {
  return (
    <PageFrame title="地图中心" desc="按区域查找达人和团长，发现本地合作资源">
      <div className="map-layout">
        <div className="map-panel">
          <div className="map-toolbar">
            <div className="segment">
              <button className="active">全部 206</button>
              <button>达人 160</button>
              <button>团长 46</button>
            </div>
            <button className="date-pill">
              <MapPin size={15} /> 全国 <ChevronDown size={14} />
            </button>
          </div>
          <div className="mock-map">
            <span className="province p1">成都</span>
            <span className="province p2">武汉</span>
            <span className="province p3">杭州</span>
            <span className="province p4">郑州</span>
            <span className="province p5">长沙</span>
            <span className="province p6">广州</span>
            {[
              [22, 56, 18],
              [45, 48, 24],
              [68, 55, 31],
              [55, 35, 16],
              [59, 62, 21],
              [70, 78, 12],
            ].map(([x, y, n], i) => (
              <div
                key={i}
                className={`map-cluster c${i % 3}`}
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                {n}
              </div>
            ))}
            <div className="map-watermark">
              <MapPinned size={18} /> 高德地图接入预留
            </div>
          </div>
        </div>
        <div className="map-list">
          <div className="map-list-head">
            <h3>附近资源</h3>
            <span>共 206 个</span>
          </div>
          <div className="map-search">
            <Search size={16} />
            <input placeholder="搜索城市或达人" />
          </div>
          {talents.slice(0, 4).map((t, i) => (
            <div className="map-person" key={t.name}>
              <div className={`talent-avatar a${i}`}>{t.name[0]}</div>
              <p>
                <b>{t.name}</b>
                <span>
                  <MapPin size={12} />
                  {t.city} · {t.leader}
                </span>
                <small>
                  <Radio size={12} /> 本月 GMV ¥{t.amount}万
                </small>
              </p>
              <button>
                <Phone size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </PageFrame>
  );
}

function PageFrame({
  title,
  desc,
  button,
  children,
}: {
  title: string;
  desc: string;
  button?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="page-title">
        <div>
          <h2>{title}</h2>
          <p>{desc}</p>
        </div>
        {button && (
          <button className="primary">
            <span>＋</span>
            {button}
          </button>
        )}
      </div>
      {children}
    </>
  );
}
function Mini({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div>
      <span>{label}</span>
      <b>{value}</b>
      <small>{note}</small>
    </div>
  );
}
function Filters({ placeholder }: { placeholder: string }) {
  return (
    <div className="filters">
      <div className="filter-search">
        <Search size={16} />
        <input placeholder={placeholder} />
      </div>
      <button>
        全部平台 <ChevronDown size={14} />
      </button>
      <button>
        全部状态 <ChevronDown size={14} />
      </button>
      <button>
        全部地区 <ChevronDown size={14} />
      </button>
      <span />
      <button>
        <Download size={15} /> 导出
      </button>
    </div>
  );
}

function CopywritingPanel({
  channel,
  category,
}: {
  channel: ChannelFilter;
  category: ProductCategory;
}) {
  const [form, setForm] = useState({ scene: "产品卖点", audience: "达人群", product: "", facts: "", policy: "", constraints: "", intent: "", tone: "professional", length: "medium" });
  const [result, setResult] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const tones = [
    { value: "professional", label: "专业正式" },
    { value: "lively", label: "活泼生动" },
    { value: "concise", label: "简洁有力" },
    { value: "emotional", label: "情感共鸣" },
  ];

  const channelLabel = channel === "all" ? "全部渠道" : channelName(channel);
  const categoryLabel = category === "tv" ? "TV" : "显示器";

  async function handleGenerate() {
    if (generating || !form.product.trim() || !form.intent.trim()) return;
    setGenerating(true);
    setResult("");
    setError("");
    try {
      const response = await fetch("/api/copywriting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, channel: channelLabel, category: categoryLabel, tone: tones.find((t) => t.value === form.tone)?.label || form.tone }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "文案生成失败");
      setResult(payload.content);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "文案生成失败，请稍后重试");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="copywriting-panel">
      <div className="page-title">
        <div>
          <h2>文案生成</h2>
          <p>
            {categoryLabel} · {channelLabel} · 智能生成电商推广文案
          </p>
        </div>
      </div>
      <div className="copywriting-layout">
        <div className="copywriting-input-area panel">
          <div className="cw-section-title"><div><Sparkles size={17}/><b>文案需求</b></div><small>带 * 为必填，信息越完整，结果越准确</small></div>
          <div className="copywriting-config">
            <div className="cw-config-item">
              <label>使用场景</label>
              <select value={form.scene} onChange={(e) => setForm({ ...form, scene: e.target.value })}><option>产品政策</option><option>产品卖点</option><option>活动预热</option><option>平销推广</option><option>活动收尾</option></select>
            </div>
            <div className="cw-config-item">
              <label>目标群体</label>
              <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}><option>团长群</option><option>达人群</option></select>
            </div>
            <div className="cw-config-item">
              <label>文案风格</label>
              <select value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })}>
                {tones.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="cw-config-item"><label>文案长度</label><select value={form.length} onChange={(e) => setForm({ ...form, length: e.target.value })}><option value="short">精简（100字内）</option><option value="medium">标准（200字内）</option><option value="long">详细（350字内）</option></select></div>
            <div className="cw-config-item">
              <label>目标渠道</label>
              <span className="cw-tag">{channelLabel}</span>
            </div>
            <div className="cw-config-item">
              <label>产品品类</label>
              <span className="cw-tag">{categoryLabel}</span>
            </div>
          </div>
          <div className="cw-form-grid">
            <label className="cw-field"><span>产品型号 *</span><input value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} placeholder={`例如：${categoryLabel} 鹏7 26款`} /></label>
            <label className="cw-field cw-wide"><span>已确认的产品卖点/参数</span><textarea value={form.facts} onChange={(e) => setForm({ ...form, facts: e.target.value })} placeholder="仅填写已经确认的事实，多个卖点可换行" /></label>
            <label className="cw-field cw-wide"><span>活动政策与价格依据</span><textarea value={form.policy} onChange={(e) => setForm({ ...form, policy: e.target.value })} placeholder="填写优惠、佣金、补贴、到手价及叠加关系；不确定可留空" /></label>
            <label className="cw-field"><span>时间/地区/适用条件</span><input value={form.constraints} onChange={(e) => setForm({ ...form, constraints: e.target.value })} placeholder="例如：9月1日至9月7日，仅限京东" /></label>
            <label className="cw-field cw-wide"><span>希望如何生成 *</span><textarea value={form.intent} onChange={(e) => setForm({ ...form, intent: e.target.value })} placeholder="例如：突出高刷和游戏体验，语气专业但有行动号召，适合直接发达人群" /></label>
          </div>
          {error && <div className="cw-error"><AlertCircle size={15}/>{error}</div>}
          <button
            className="cw-generate-btn primary"
            onClick={handleGenerate}
            disabled={generating || !form.product.trim() || !form.intent.trim()}
          >
            {generating ? (
              <>
                <RefreshCw size={16} className="cw-spin" /> 生成中…
              </>
            ) : (
              <>
                <Sparkles size={16} /> 生成文案
              </>
            )}
          </button>
          {generating && (
            <div className="cw-generating-hint" role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 7, color: "#5d6d83", fontSize: 11 }}>
              <RefreshCw size={14} className="cw-spin" />
              正在生成，复杂需求可能需要几十秒，请勿重复点击。
            </div>
          )}
        </div>
        {result && (
          <div className="copywriting-result">
            <div className="panel-head">
              <div>
                <h3>生成结果</h3>
                <p>点击生成按钮获取文案</p>
              </div>
              <button
                onClick={async () => { await navigator.clipboard.writeText(result); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }}
              >
                {copied ? "已复制" : "复制文案"}
              </button>
            </div>
            <div className="cw-result-content">
              <pre>{result}</pre>
            </div>
            <div className="cw-review-note"><AlertCircle size={14}/> AI 生成内容须经人工核对产品参数、价格与活动政策后再发布</div>
          </div>
        )}
        {!result && !generating && (
          <div className="copywriting-empty">
            <FileText size={48} />
            <h3>智能文案生成</h3>
            <p>
              输入您的需求，选择风格和渠道，一键生成专业的电商推广文案
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
