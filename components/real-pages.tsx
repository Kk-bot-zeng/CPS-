"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
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

type Summary = {
  gmv: number;
  gsv: number;
  orders: number;
  validOrders: number;
  quantity: number;
  activeTalents: number;
  talents: { name: string; gmv: number; gsv: number; orders: number }[];
  products: { name: string; gmv: number; qty: number; talents: number }[];
  daily: { date: string; gmv: number; gsv: number }[];
};
type Talent = {
  id: string;
  name: string;
  platform: string | null;
  platform_account: string | null;
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
const responseCache = new Map<string, { value: unknown; at: number }>();
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
export function prefetchCoreData() {
  void Promise.allSettled([
    jsonFetch("/api/dashboard?start=2026-01-01&end=2026-12-31"),
    jsonFetch("/api/talents"),
    jsonFetch("/api/leaders"),
  ]);
}

export function RealOverview({ channel }: { channel: ChannelFilter }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [start, setStart] = useState("2026-01-01");
  const [end, setEnd] = useState("2026-12-31");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(
        await jsonFetch(
          `/api/dashboard?start=${start}&end=${end}&channel=${channel}`,
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [start, end, channel]);
  useEffect(() => {
    load();
  }, [load]);
  if (loading) return <Loading />;
  if (!summary) return <Empty text="暂时无法读取销售数据" />;
  const rate = summary.gmv ? (summary.gsv / summary.gmv) * 100 : 0;
  return (
    <>
      <div className="page-title">
        <div>
          <h2>
            经营总览 · {channel === "all" ? "全部渠道" : channelName(channel)}
          </h2>
          <p>以下数据实时读取自Supabase订单库</p>
        </div>
        <div className="real-actions">
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <span>至</span>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
          <button onClick={load}>
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
      </div>
      <div className="kpi-grid">
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
        <RealKpi
          label="金额有效率"
          value={`${rate.toFixed(1)}%`}
          note="GSV ÷ GMV"
        />
        <RealKpi
          label="活跃达人"
          value={String(summary.activeTalents)}
          note={`销售数量 ${summary.quantity.toLocaleString()}`}
        />
      </div>
      <div className="dashboard-grid">
        <div className="panel wide">
          <RealHead
            title="达人销售排行"
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
                  <th>有效率</th>
                </tr>
              </thead>
              <tbody>
                {summary.talents.slice(0, 12).map((t, i) => (
                  <tr key={t.name}>
                    <td>{i + 1}</td>
                    <td>
                      <b>{t.name}</b>
                    </td>
                    <td>{money(t.gmv)}</td>
                    <td>{money(t.gsv)}</td>
                    <td>{t.orders}</td>
                    <td>{t.gmv ? ((t.gsv / t.gmv) * 100).toFixed(1) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <RealHead title="近30个销售日" />
          <div className="real-bars">
            {summary.daily.slice(-30).map((d) => {
              const max = Math.max(
                ...summary.daily.slice(-30).map((x) => x.gmv),
                1,
              );
              return (
                <div key={d.date} title={`${d.date} ${money(d.gmv)}`}>
                  <i
                    style={{ height: `${Math.max(4, (d.gmv / max) * 100)}%` }}
                  />
                  <span>{d.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
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

export function RealProducts({ channel }: { channel: ChannelFilter }) {
  const [data, setData] = useState<Summary | null>(null);
  useEffect(() => {
    jsonFetch<Summary>(`/api/dashboard?channel=${channel}`)
      .then(setData)
      .catch(() => {});
  }, [channel]);
  if (!data) return <Loading />;
  return (
    <>
      <ManagerTitle
        title={`商品分析 · ${channel === "all" ? "全部渠道" : channelName(channel)}`}
        desc="按订单商品名称自动汇总"
      />
      <div className="panel">
        <RealHead
          title="商品销售排行"
          action={() => exportCsv("商品排行.csv", data.products)}
        />
        <div className="product-list">
          {data.products.map((p, i) => (
            <div key={p.name}>
              <span className={`rank r${i}`}>{i + 1}</span>
              <p>
                <b>{p.name}</b>
                <small>
                  {p.talents}位达人 · {p.qty}件
                </small>
              </p>
              <div className="product-bar">
                <i
                  style={{
                    width: `${Math.max(4, (p.gmv / (data.products[0]?.gmv || 1)) * 100)}%`,
                  }}
                />
              </div>
              <strong>{money(p.gmv)}</strong>
            </div>
          ))}
        </div>
      </div>
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
    Promise.all([
      jsonFetch<Talent[]>(`/api/talents?channel=${channel}`),
      jsonFetch<Leader[]>(`/api/leaders?channel=${channel}`),
    ])
      .then(([t, l]) => {
        setTalents(t);
        setLeaders(l);
      })
      .catch(() => {});
  }, [channel]);
  const located: MapResource[] = [
    ...talents.map((x) => ({
      id: `talent-${x.id}`,
      type: "达人",
      name: x.name,
      channel: x.platform,
      city: x.city,
      address: x.address,
      longitude: x.longitude,
      latitude: x.latitude,
    })),
    ...leaders.map((x) => ({
      id: `leader-${x.id}`,
      type: "团长",
      name: x.name,
      channel: x.platform,
      city: x.city,
      address: x.address,
      longitude: x.longitude,
      latitude: x.latitude,
    })),
  ].filter(
    (x): x is MapResource =>
      Boolean(
        x.city || x.address || (x.longitude != null && x.latitude != null),
      ) &&
      (kind === "全部" || x.type === kind) &&
      (!q ||
        `${x.name}${x.city || ""}${x.address || ""}`
          .toLowerCase()
          .includes(q.toLowerCase())),
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
          <AmapMap resources={located} onSelect={setSelected} />
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
              onClick={() => setSelected(x.id)}
            >
              <div className={`talent-avatar a${i % 5}`}>{x.name[0]}</div>
              <p>
                <b>{x.name}</b>
                <span>
                  <MapPin size={12} />
                  {[x.city, x.address].filter(Boolean).join(" · ")}
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
      <button onClick={edit}>
        <Edit3 size={14} />
      </button>
      <button className="danger" onClick={remove}>
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
  return (
    <div className="modal-backdrop">
      <div className="form-modal">
        <div className="modal-head">
          <h3>{title}</h3>
          <button onClick={close}>
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
