"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Edit3,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import { CHANNELS, channelName, type ChannelFilter } from "@/lib/channels";

type Kind = "达人" | "团长";
type RecordRow = {
  id: string;
  kind: Kind;
  name: string;
  platform: string | null;
  platform_account?: string | null;
  contact_name?: string | null;
  phone: string | null;
  wechat: string | null;
  leader_id?: string | null;
  leaders?: { name: string } | null;
  province: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  cooperation_status: string;
  notes: string | null;
};
const blank = (channel: ChannelFilter): Partial<RecordRow> => ({
  kind: "达人",
  platform: channel === "all" ? null : channel,
  cooperation_status: "合作中",
});
export default function ResourceManager({
  channel,
}: {
  channel: ChannelFilter;
}) {
  const [talents, setTalents] = useState<RecordRow[]>([]),
    [leaders, setLeaders] = useState<RecordRow[]>([]),
    [q, setQ] = useState(""),
    [kind, setKind] = useState<"全部" | Kind>("全部"),
    [editing, setEditing] = useState<Partial<RecordRow> | null>(null),
    [batch, setBatch] = useState<any[] | null>(null),
    [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  async function load() {
    const [t, l] = await Promise.all([
      fetch(`/api/talents?channel=${channel}`).then((r) => r.json()),
      fetch(`/api/leaders?channel=${channel}`).then((r) => r.json()),
    ]);
    setTalents(t.map((x: any) => ({ ...x, kind: "达人" })));
    setLeaders(l.map((x: any) => ({ ...x, kind: "团长" })));
  }
  useEffect(() => {
    void load();
  }, [channel]);
  const rows = useMemo(
    () =>
      [...talents, ...leaders].filter(
        (r) =>
          (kind === "全部" || r.kind === kind) &&
          (!q ||
            `${r.name}${r.phone || ""}${r.city || ""}`
              .toLowerCase()
              .includes(q.toLowerCase())),
      ),
    [talents, leaders, kind, q],
  );
  async function save() {
    if (!editing?.name || !editing.platform) {
      setMessage("请填写名称并选择渠道");
      return;
    }
    const base = editing.kind === "达人" ? "talents" : "leaders",
      url = editing.id ? `/api/${base}/${editing.id}` : `/api/${base}`;
    const r = await fetch(url, {
      method: editing.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (!r.ok) {
      setMessage(j.error || "保存失败");
      return;
    }
    setEditing(null);
    setMessage("");
    await load();
  }
  async function remove(r: RecordRow) {
    if (!confirm(`确定删除${r.kind}“${r.name}”吗？`)) return;
    await fetch(`/api/${r.kind === "达人" ? "talents" : "leaders"}/${r.id}`, {
      method: "DELETE",
    });
    await load();
  }
  function template() {
    const data = [
      {
        "身份(达人/团长)": "团长",
        名称: "示例团长",
        "渠道(京东/抖音/天猫)": "抖音",
        平台账号: "",
        所属团长: "",
        联系人: "张三",
        手机号: "",
        微信: "",
        省: "广东省",
        市: "深圳市",
        "区/县": "南山区",
        详细地址: "粤海街道XX路XX号",
        合作状态: "合作中",
        备注: "",
      },
      {
        "身份(达人/团长)": "达人",
        名称: "示例达人",
        "渠道(京东/抖音/天猫)": "抖音",
        平台账号: "dy123",
        所属团长: "示例团长",
        联系人: "",
        手机号: "",
        微信: "",
        省: "广东省",
        市: "深圳市",
        "区/县": "南山区",
        详细地址: "粤海街道XX路XX号",
        合作状态: "合作中",
        备注: "",
      },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(data),
      "达人团长模板",
    );
    XLSX.writeFile(wb, "达人团长批量导入模板.xlsx");
  }
  async function readFile(file: File) {
    const wb = XLSX.read(await file.arrayBuffer());
    const raw = XLSX.utils.sheet_to_json<any>(wb.Sheets[wb.SheetNames[0]], {
      defval: "",
    });
    setBatch(
      raw.map((r) => ({
        type: r["身份(达人/团长)"],
        name: String(r["名称"]),
        channel:
          ({ 京东: "jd", 抖音: "douyin", 天猫: "tmall" } as any)[
            r["渠道(京东/抖音/天猫)"]
          ] || r["渠道(京东/抖音/天猫)"],
        account: String(r["平台账号"]),
        leader: String(r["所属团长"]),
        contact: String(r["联系人"]),
        phone: String(r["手机号"]),
        wechat: String(r["微信"]),
        province: String(r["省"]),
        city: String(r["市"]),
        district: String(r["区/县"]),
        address: String(r["详细地址"]),
        status: String(r["合作状态"]),
        notes: String(r["备注"]),
      })),
    );
  }
  async function importBatch() {
    const r = await fetch("/api/resources/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: batch }),
    });
    const j = await r.json();
    if (!r.ok) {
      setMessage([j.error, ...(j.errors || [])].join("；"));
      return;
    }
    setMessage(`成功导入${j.total}条：${j.leaders}位团长、${j.talents}位达人`);
    setBatch(null);
    await load();
  }
  return (
    <>
      <div className="page-title">
        <div>
          <h2>
            达人/团长管理 ·{" "}
            {channel === "all" ? "全部渠道" : channelName(channel)}
          </h2>
          <p>统一管理合作资源，新增时选择身份即可</p>
        </div>
        <div className="resource-actions">
          <button onClick={template}>
            <Download size={15} />
            下载模板
          </button>
          <button onClick={() => input.current?.click()}>
            <UploadCloud size={15} />
            批量导入
          </button>
          <button
            className="primary"
            onClick={() => setEditing(blank(channel))}
          >
            <Plus size={15} />
            新增资源
          </button>
        </div>
      </div>
      <input
        ref={input}
        hidden
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
      />
      <div className="filters real-filter">
        <div className="filter-search">
          <Search size={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索姓名、电话或城市"
          />
        </div>
        <div className="segment">
          {(["全部", "达人", "团长"] as const).map((x) => (
            <button
              className={kind === x ? "active" : ""}
              onClick={() => setKind(x)}
              key={x}
            >
              {x}
            </button>
          ))}
        </div>
        <span />
      </div>
      {message && <div className="notice">{message}</div>}
      <div className="panel table-panel">
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>身份</th>
                <th>名称</th>
                <th>渠道</th>
                <th>账号/联系人</th>
                <th>所属团长</th>
                <th>地区</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`}>
                  <td>
                    <span className="tag">{r.kind}</span>
                  </td>
                  <td>
                    <b>{r.name}</b>
                  </td>
                  <td>{channelName(r.platform)}</td>
                  <td>
                    {r.kind === "达人"
                      ? r.platform_account || "-"
                      : r.contact_name || "-"}
                  </td>
                  <td>
                    {r.kind === "达人" ? r.leaders?.name || "未分配" : "-"}
                  </td>
                  <td>
                    {[r.province, r.city, r.district]
                      .filter(Boolean)
                      .join(" ") || "-"}
                  </td>
                  <td>{r.cooperation_status}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => setEditing(r)}>
                        <Edit3 size={14} />
                      </button>
                      <button className="danger" onClick={() => remove(r)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {editing && (
        <ResourceModal
          value={editing}
          leaders={leaders}
          setValue={setEditing}
          close={() => setEditing(null)}
          save={save}
        />
      )}{" "}
      {batch && (
        <BatchModal
          rows={batch}
          close={() => setBatch(null)}
          submit={importBatch}
        />
      )}
    </>
  );
}
function ResourceModal({
  value,
  leaders,
  setValue,
  close,
  save,
}: {
  value: Partial<RecordRow>;
  leaders: RecordRow[];
  setValue: (v: Partial<RecordRow>) => void;
  close: () => void;
  save: () => void;
}) {
  const set = (k: string, v: string) => setValue({ ...value, [k]: v });
  return (
    <div className="modal-backdrop">
      <div className="form-modal">
        <div className="modal-head">
          <h3>{value.id ? "编辑" : "新增"}达人/团长</h3>
          <button onClick={close}>
            <X />
          </button>
        </div>
        <div className="form-grid">
          <Field label="身份*">
            <select
              value={value.kind}
              disabled={!!value.id}
              onChange={(e) => set("kind", e.target.value)}
            >
              <option>达人</option>
              <option>团长</option>
            </select>
          </Field>
          <Field label="渠道*">
            <select
              value={value.platform || ""}
              onChange={(e) => set("platform", e.target.value)}
            >
              <option value="">请选择</option>
              {CHANNELS.map((c) => (
                <option value={c.code} key={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="名称*">
            <input
              value={value.name || ""}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          {value.kind === "达人" ? (
            <>
              <Field label="平台账号">
                <input
                  value={value.platform_account || ""}
                  onChange={(e) => set("platform_account", e.target.value)}
                />
              </Field>
              <Field label="所属团长">
                <select
                  value={value.leader_id || ""}
                  onChange={(e) => set("leader_id", e.target.value)}
                >
                  <option value="">未分配</option>
                  {leaders
                    .filter((l) => l.platform === value.platform)
                    .map((l) => (
                      <option value={l.id} key={l.id}>
                        {l.name}
                      </option>
                    ))}
                </select>
              </Field>
            </>
          ) : (
            <Field label="联系人">
              <input
                value={value.contact_name || ""}
                onChange={(e) => set("contact_name", e.target.value)}
              />
            </Field>
          )}{" "}
          {[
            ["手机号", "phone"],
            ["微信", "wechat"],
            ["省", "province"],
            ["市", "city"],
            ["区/县", "district"],
            ["详细地址", "address"],
          ].map(([l, k]) => (
            <Field label={l} key={k}>
              <input
                value={(value as any)[k] || ""}
                onChange={(e) => set(k, e.target.value)}
              />
            </Field>
          ))}
        </div>
        <div className="modal-actions">
          <button onClick={close}>取消</button>
          <button className="primary" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function BatchModal({
  rows,
  close,
  submit,
}: {
  rows: any[];
  close: () => void;
  submit: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="form-modal batch-modal">
        <div className="modal-head">
          <h3>批量导入预览（{rows.length}条）</h3>
          <button onClick={close}>
            <X />
          </button>
        </div>
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>身份</th>
                <th>名称</th>
                <th>渠道</th>
                <th>所属团长</th>
                <th>地区</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((r, i) => (
                <tr key={i}>
                  <td>{r.type}</td>
                  <td>{r.name}</td>
                  <td>{channelName(r.channel)}</td>
                  <td>{r.leader || "-"}</td>
                  <td>
                    {[r.province, r.city, r.district].filter(Boolean).join(" ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          <button onClick={close}>取消</button>
          <button className="primary" onClick={submit}>
            确认导入
          </button>
        </div>
      </div>
    </div>
  );
}
