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
  PackageSearch,
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
} from "lucide-react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/browser";
import {
  LeaderManager,
  prefetchCoreData,
  RealMap,
  RealOverview,
  RealProducts,
  TalentManager,
} from "@/components/real-pages";
import { CHANNELS, channelName, type ChannelFilter } from "@/lib/channels";

type Page =
  "总览" | "达人管理" | "团长管理" | "商品分析" | "数据导入" | "地图中心";
type Order = {
  orderNo: string;
  productId: string;
  qty: number;
  paidAt: string;
  status: string;
  amount: number;
  talent: string;
  product: string;
};
type ImportJob = {
  id: string;
  channel: string;
  file_name: string;
  status: string;
  total_rows: number;
  created_at: string;
  completed_at: string | null;
};

const nav: { label: Page; icon: React.ElementType }[] = [
  { label: "总览", icon: LayoutDashboard },
  { label: "达人管理", icon: UserRound },
  { label: "团长管理", icon: UsersRound },
  { label: "商品分析", icon: PackageSearch },
  { label: "数据导入", icon: FileSpreadsheet },
  { label: "地图中心", icon: MapPinned },
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
  useEffect(() => {
    prefetchCoreData();
  }, []);
  async function logout() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <Zap size={20} />
          </div>
          {!collapsed && (
            <div>
              <strong>雷鸟电视</strong>
              <span>CPS SYSTEM</span>
            </div>
          )}
        </div>
        <button className="collapse" onClick={() => setCollapsed(!collapsed)}>
          <Menu size={18} />
        </button>
        <nav>
          {nav.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={page === label ? "active" : ""}
              onClick={() => setPage(label)}
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
          <div>
            <p className="eyebrow">THUNDERBIRD TV · CPS OPERATIONS</p>
            <h1>{page}</h1>
          </div>
          <div className="top-actions">
            <label className="channel-switch">
              <span>当前渠道</span>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as ChannelFilter)}
              >
                <option value="all">全部渠道</option>
                {CHANNELS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="global-search">
              <Search size={17} />
              <input placeholder="搜索达人、团长或商品" />
            </div>
            <button className="icon-btn">
              <Bell size={19} />
              <i />
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
          {page === "总览" && <RealOverview channel={channel} />}
          {page === "达人管理" && <TalentManager channel={channel} />}
          {page === "团长管理" && <LeaderManager channel={channel} />}
          {page === "商品分析" && <RealProducts channel={channel} />}
          {page === "数据导入" && (
            <ImportPage
              orders={orders}
              setOrders={setOrders}
              uploading={uploading}
              setUploading={setUploading}
            />
          )}
          {page === "地图中心" && <RealMap />}
        </section>
      </main>
    </div>
  );
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
  orders,
  setOrders,
  uploading,
  setUploading,
}: {
  orders: Order[];
  setOrders: (x: Order[]) => void;
  uploading: boolean;
  setUploading: (x: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saveMessage, setSaveMessage] = useState("");
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");
  async function loadJobs(nextChannel: ChannelFilter = channel) {
    setJobsLoading(true);
    try {
      const response = await fetch(`/api/import-jobs?channel=${nextChannel}`);
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
  }, [channel]);
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
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const name = wb.SheetNames.includes("gmv") ? "gmv" : wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        wb.Sheets[name],
        { raw: false, dateNF: "yyyy-mm-dd hh:mm:ss" },
      );
      const num = (v: unknown) => Number(String(v ?? 0).replace(/,/g, ""));
      setOrders(
        rows
          .map((r) => ({
            orderNo: String(r["主订单编号"] ?? ""),
            productId: String(r["商品ID"] ?? ""),
            qty: num(r["商品数量"]),
            paidAt: String(r["支付完成时间"] ?? ""),
            status: String(r["订单状态"] ?? ""),
            amount: num(r["订单应付金额"]),
            talent: String(r["达人昵称"] ?? ""),
            product: String(r["选购商品"] ?? ""),
          }))
          .filter((r) => r.orderNo),
      );
    } finally {
      setUploading(false);
    }
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
    try {
      const batchSize = 1000;
      const batches = Math.ceil(orders.length / batchSize);
      for (let i = 0; i < batches; i++) {
        const response = await fetch("/api/import-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel,
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
        setProgress(Math.round(((i + 1) / batches) * 100));
      }
      setSaveMessage(
        `已成功写入 ${orders.length.toLocaleString()} 条订单，重复订单已自动更新`,
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
      <div className="import-channel">
        <div>
          <b>第一步：选择导入渠道</b>
          <span>渠道会写入每条订单，提交后不能跨渠道覆盖</span>
        </div>
        <select
          value={channel}
          onChange={(e) => {
            const next = e.target.value as ChannelFilter;
            setChannel(next);
            setOrders([]);
            setFileName("");
            setSaveMessage("");
          }}
        >
          <option value="all">请选择渠道</option>
          {CHANNELS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xls,.csv"
        hidden
        onChange={(e) => e.target.files?.[0] && load(e.target.files[0])}
      />
      <div
        className={`upload-zone ${orders.length ? "has-data" : ""} ${channel === "all" ? "disabled" : ""}`}
        onClick={() => channel !== "all" && input.current?.click()}
      >
        <div className="upload-icon">
          <UploadCloud size={30} />
        </div>
        <h3>
          {channel === "all"
            ? "请先选择渠道"
            : uploading
              ? "正在解析订单数据…"
              : orders.length
                ? `${channelName(channel)}文件解析完成`
                : "拖拽订单文件到这里，或点击上传"}
        </h3>
        <p>支持 Excel / CSV，自动识别 gmv、gsv 工作表，单文件建议不超过 50MB</p>
        <button className="primary" disabled={channel === "all"}>
          {orders.length ? "重新选择文件" : "选择订单文件"}
        </button>
      </div>
      {orders.length > 0 && (
        <>
          <div className="mini-kpis import-result">
            <Mini
              label="目标渠道"
              value={channelName(channel)}
              note="本批数据固定渠道"
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
