"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  AlertCircle,
  ArchiveRestore,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  Layers3,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { ChannelFilter } from "@/lib/channels";
import { channelName } from "@/lib/channels";

type ProductCategory = "tv" | "monitor";
type TabKey = "generator" | "products" | "policies" | "versions" | "history";

export type ProductKnowledge = {
  id: string;
  category: ProductCategory;
  series: string;
  model: string;
  sku: string;
  promotionName: string;
  status: "active" | "inactive";
  version: number;
  updatedAt: string;
  fields: Record<string, string>;
};

type KnowledgeField = {
  id?: string;
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "multiselect" | "longtext";
  required?: boolean;
  active: boolean;
  options?: string[];
};

type ImportRow = {
  rowNumber: number;
  values: Record<string, string>;
  state: "new" | "update" | "skip" | "conflict" | "error";
  message?: string;
};

type ImportPreview = {
  importId: string;
  fileName: string;
  rows: ImportRow[];
  mode: "overwrite";
  summary?: { totalRows?: number; validRows?: number; invalidRows?: number; duplicateRows?: number; creates?: number; updates?: number; skips?: number; conflicts?: number; newFields?: { field_key: string; field_label: string; field_type: string }[] };
  errors?: string[];
  warnings?: string[];
  newFields?: { field_key: string; field_label: string; field_type: string }[];
  restoredFields?: { field_key: string; field_label: string }[];
};

type Policy = {
  id: string;
  model: string;
  channel: string;
  name: string;
  content: string;
  validFrom: string;
  validTo: string;
  status: "active" | "expired";
};

type KnowledgeVersion = {
  id: string;
  productId?: string;
  version: number;
  fileName: string;
  rowCount: number;
  createdAt: string;
  createdBy: string;
  status: "active" | "archived";
};

type CopyHistory = {
  id: string;
  products: string[];
  length: string;
  scene: string;
  createdAt: string;
  content: string;
};

function categoryName(category: ProductCategory) {
  return category === "tv" ? "TV" : "显示器";
}

function safeText(value: unknown) {
  return String(value ?? "").trim();
}

function normaliseProduct(input: any, category: ProductCategory, index: number): ProductKnowledge {
  const rawFields = input.fields || input.custom_fields || input.custom_values || input.attributes || {};
  const fixed = new Set(["id", "category", "product_category", "series", "product_series", "model", "canonical_model", "model_name", "sku", "promotionName", "promotion_name", "status", "version", "updatedAt", "updated_at", "created_at", "updated_at", "fields", "custom_fields", "custom_values", "attributes", "current_version_id", "canonical_model_normalized"]);
  const fields: Record<string, string> = Object.keys(rawFields).reduce((acc, key) => { acc[key] = safeText(rawFields[key]); return acc; }, {} as Record<string, string>);
  Object.keys(input || {}).forEach((key) => { if (!fixed.has(key) && input[key] != null) fields[key] = safeText(input[key]); });
  return {
    id: safeText(input.id) || `knowledge-${category}-${index}`,
    category,
    series: safeText(input.series ?? input.product_series),
    model: safeText(input.model ?? input.canonical_model ?? input.model_name),
    sku: safeText(input.sku),
    promotionName: safeText(input.promotionName ?? input.promotion_name),
    status: input.status === "inactive" ? "inactive" : "active",
    version: Number(input.version) || 1,
    updatedAt: safeText(input.updatedAt ?? input.updated_at) || new Date().toISOString().slice(0, 10),
    fields,
  };
}

function normaliseField(input: any): KnowledgeField | null {
  const key = safeText(input.key ?? input.field_key ?? input.name);
  const label = safeText(input.label ?? input.field_label ?? input.name);
  if (!key || !label) return null;
  const types: KnowledgeField["type"][] = ["text", "number", "date", "select", "multiselect", "longtext"];
  const sourceType = input.type ?? input.field_type;
  const type = sourceType === "textarea" ? "longtext" : (types.includes(sourceType) ? sourceType : "text");
  return { id: safeText(input.id) || undefined, key, label, type, required: Boolean(input.required), active: input.active !== false, options: Array.isArray(input.options) ? input.options.map((option: any) => safeText(option?.label ?? option?.value ?? option)).filter(Boolean) : undefined };
}

function normalisePolicy(input: any, index: number): Policy {
  const data = input.policy_data || input.policyData || {};
  const content = typeof data === "string" ? data : safeText(data.content ?? data.policy ?? data.description);
  const startsAt = safeText(input.starts_at ?? input.startsAt).slice(0, 10);
  const endsAt = safeText(input.ends_at ?? input.endsAt).slice(0, 10);
  const expired = input.effective_now === false || input.status === "inactive" || (endsAt && endsAt < new Date().toISOString().slice(0, 10));
  return {
    id: safeText(input.id) || `policy-${index}`,
    model: safeText(input.canonical_model ?? input.model),
    channel: safeText(input.channel) || "all",
    name: safeText(input.policy_name ?? input.policyName ?? input.name) || "未命名政策",
    content,
    validFrom: startsAt,
    validTo: endsAt,
    status: expired ? "expired" : "active",
  };
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok) {
    const message = payload?.error || payload?.errors?.join?.("；") || `HTTP ${response.status}`;
    throw new Error(String(message));
  }
  return payload as T;
}

function formatFacts(product: ProductKnowledge | null, fields: KnowledgeField[]) {
  if (!product) return "";
  const lines = [
    `品类：${categoryName(product.category)}`,
    `产品系列：${product.series || "未提供"}`,
    `标准型号：${product.model}`,
    `SKU：${product.sku || "未提供"}`,
    `推广名：${product.promotionName || "未提供"}`,
  ];
  fields.filter((field) => field.active).forEach((field) => {
    const value = product.fields[field.key];
    if (value) lines.push(`${field.label}：${value}`);
  });
  return lines.join("\n");
}

export default function ProductKnowledgeWorkspace({ channel, category }: { channel: ChannelFilter; category: ProductCategory }) {
  const [tab, setTab] = useState<TabKey>("generator");
  const [products, setProducts] = useState<ProductKnowledge[]>([]);
  const [fields, setFields] = useState<KnowledgeField[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [versions, setVersions] = useState<KnowledgeVersion[]>([]);
  const [copyHistory, setCopyHistory] = useState<CopyHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductKnowledge | null>(null);
  const [activeEdit, setActiveEdit] = useState<ProductKnowledge | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadWorkspace = async () => {
    setLoading(true);
    setError("");
    try {
      const [productPayload, fieldPayload, policyPayload, historyPayload] = await Promise.allSettled([
        // The library defaults to the active catalog.  Inactive records remain
        // available through the product/version APIs, but should not make a
        // completed bulk delete look like it failed in the main table.
        requestJson<any>(`/api/product-knowledge?category=${category}&status=active&pageSize=200`),
        requestJson<any>(`/api/product-knowledge/fields?category=${category}&includeInactive=true`),
        requestJson<any>(`/api/product-knowledge/policies?category=${category}`),
        requestJson<any>(`/api/copywriting/history?category=${category}`),
      ]);
      const failed: string[] = [];
      let loadedProducts: ProductKnowledge[] = products;
      if (productPayload.status === "fulfilled") {
        const rows = productPayload.value.products || productPayload.value.rows || productPayload.value.items || productPayload.value.data || [];
        if (Array.isArray(rows)) {
          loadedProducts = rows.map((item: any, index: number) => normaliseProduct(item, category, index));
          setProducts(loadedProducts);
        }
      } else { failed.push("产品资料"); setProducts([]); }
      if (fieldPayload.status === "fulfilled") {
        const rows = fieldPayload.value.fields || fieldPayload.value.rows || fieldPayload.value.items || fieldPayload.value.data || [];
        if (Array.isArray(rows)) {
          const next = rows.map(normaliseField).filter(Boolean) as KnowledgeField[];
          setFields(next);
        }
      } else { failed.push("字段配置"); setFields([]); }
      if (policyPayload.status === "fulfilled") {
        const rows = policyPayload.value.policies || policyPayload.value.rows || policyPayload.value.items || policyPayload.value.data || [];
        if (Array.isArray(rows)) setPolicies(rows.map(normalisePolicy));
      } else { failed.push("活动政策"); setPolicies([]); }
      if (historyPayload.status === "fulfilled") {
        const rows = historyPayload.value.history || historyPayload.value.rows || historyPayload.value.items || historyPayload.value.data || historyPayload.value;
        if (Array.isArray(rows)) setCopyHistory(rows as CopyHistory[]);
      } else setCopyHistory([]);
      const versionResults = await Promise.allSettled(loadedProducts.slice(0, 80).map((product) => requestJson<any>(`/api/product-knowledge/versions?productId=${encodeURIComponent(product.id)}`)));
      const loadedVersions: KnowledgeVersion[] = [];
      versionResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          const product = loadedProducts[index];
          const rows = result.value.versions || [];
          rows.forEach((item: any) => loadedVersions.push({ id: safeText(item.id), productId: safeText(item.product_id) || product.id, version: Number(item.version_no) || 1, fileName: `${product.model} · ${safeText(item.source) || "资料版本"}`, rowCount: 1, createdAt: safeText(item.created_at).replace("T", " ").slice(0, 16), createdBy: safeText(item.created_by) || "—", status: item.is_current ? "active" : "archived" }));
        }
      });
      if (loadedVersions.length) setVersions(loadedVersions.sort((a, b) => b.version - a.version));
      else setVersions([]);
      if (failed.length) setError(`${failed.join("、")}加载失败，已停止展示相关数据；请检查后端服务与数据库连接。`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedProduct(null);
    setActiveEdit(null);
    void loadWorkspace();
  }, [category]);

  const activeFields = useMemo(() => fields.filter((field) => field.active), [fields]);
  const activeProducts = useMemo(() => products.filter((product) => product.status === "active"), [products]);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? "" : current), 3200);
  }

  async function updateProduct(product: ProductKnowledge) {
    try {
      const payload = await requestJson<any>(`/api/product-knowledge/${encodeURIComponent(product.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, product_series: product.series, canonical_model: product.model, sku: product.sku, promotion_name: product.promotionName, status: product.status, custom_values: product.fields }) });
      const saved = normaliseProduct(payload.product || payload, category, 0);
      setProducts((current) => current.map((item) => item.id === saved.id ? saved : item));
      setSelectedProduct(saved);
      setActiveEdit(null);
      showNotice("产品资料已保存");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "产品资料保存失败，数据库未发生变更"); }
  }

  async function bulkDeleteProducts(productIds: string[]) {
    if (!productIds.length) return { deleted: 0, ignored: 0 };
    setError("");
    try {
      const result = await requestJson<{ deleted?: number; ignored?: number; deletedIds?: string[] }>("/api/product-knowledge/bulk-delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, ids: productIds }),
      });
      await loadWorkspace();
      const deleted = Number(result.deleted || 0);
      const ignored = Number(result.ignored || 0);
      showNotice(ignored ? `已停用${deleted}条产品资料，忽略${ignored}条（已停用或品类不匹配）` : `已停用${deleted}条产品资料，历史版本已保留`);
      return { deleted, ignored };
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "批量删除失败，数据库未发生变更";
      setError(message);
      throw reason;
    }
  }

  function downloadTemplate() {
    const headers = ["品类", "产品系列", "标准型号", "SKU", "推广名", "状态", ...activeFields.map((field) => field.label)];
    const sample: Record<string, string> = { 品类: categoryName(category), "产品系列": "示例系列", "标准型号": category === "tv" ? "65鹤6 26款" : "27英寸 4K 160Hz显示器", SKU: "请填写SKU", 推广名: "请填写推广名", 状态: "启用" };
    activeFields.forEach((field) => { sample[field.label] = field.type === "date" ? "2026-09-01" : `请填写${field.label}`; });
    const sheet = XLSX.utils.json_to_sheet([sample], { header: headers });
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "产品资料");
    XLSX.writeFile(book, `${categoryName(category)}-产品资料库模板.xlsx`);
    showNotice("模板已下载，字段会按当前资料库配置生成");
  }

  function onImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        try {
        const workbook = XLSX.read(reader.result, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });
        const headers = Array.isArray(matrix[0]) ? matrix[0].map((value) => safeText(value)) : [];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", blankrows: false }).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, safeText(value)])));
        if (!rows.length) throw new Error("文件没有可导入的数据行");
        setImportPreview(null);
        setError("");
        // The browser only parses the workbook.  Classification, field
        // discovery and all conflict counts come from the server preview so a
        // failed request can never fall back to local optimistic data.
        const payload = await requestJson<any>("/api/product-knowledge/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "preview", category, mode: "overwrite", autoCreateFields: true, fileName: file.name, headers, rows }),
        });
        if (!payload.importId) throw new Error("服务器未返回导入预览ID");
        const previewRows: ImportRow[] = (payload.previewRows || []).map((row: any) => ({
          rowNumber: Number(row.rowNumber) || 0,
          values: Object.fromEntries(Object.entries(row.values || {}).map(([key, value]) => [key, safeText(value)])),
          state: row.state === "update" ? "update" : row.state === "skip" ? "skip" : "new",
        }));
        setImportPreview({ importId: String(payload.importId), fileName: file.name, mode: "overwrite", rows: previewRows, summary: payload.summary, errors: payload.errors || [], warnings: payload.warnings || [], newFields: payload.newFields || [], restoredFields: payload.restoredFields || [] });
        setTab("products");
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "文件解析或服务端预览失败，请检查模板格式");
        }
      })();
    };
    reader.readAsArrayBuffer(file);
  }

  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);

  async function commitImport() {
    if (!importPreview) return;
    const validRows = importPreview.rows.filter((row) => row.state === "new" || row.state === "update");
    if (!validRows.length) { setError("没有可提交的有效数据，请修正参数表后重新导入"); return; }
    try {
      const confirmed = await requestJson<{ summary?: { creates?: number; updates?: number } }>("/api/product-knowledge/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm", importId: importPreview.importId }) });
      const summary = confirmed.summary || {};
      showNotice(`已覆盖${Number(summary.updates || 0)}条、 新增${Number(summary.creates || 0)}条产品资料，并生成新版本`);
      await loadWorkspace();
      setImportPreview(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "导入确认失败，数据库未发生变更；请修正后重试");
    }
  }

  async function addField() {
    const label = safeText(newField.label);
    const key = safeText(newField.key).toLowerCase() || `field_${Date.now().toString(36)}`;
    if (!label || !key) { setError("请输入字段名称"); return; }
    if (fields.some((field) => field.key === key || field.label === label)) { setError("字段名称或字段标识已存在"); return; }
    try {
      const created = await requestJson<any>("/api/product-knowledge/fields", { method: "POST", headers: { "Content-Type": "application/json" }, body: { category, field_key: key, field_label: label, field_type: newField.type === "longtext" ? "textarea" : newField.type } as any });
      const nextField = normaliseField(created);
      if (!nextField) throw new Error("服务器返回的字段格式不正确");
      setFields((current) => [...current, nextField]);
      setNewField({ label: "", key: "", type: "text" });
      showNotice("自定义字段已添加");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "字段添加失败，数据库未发生变更"); }
  }

  async function toggleField(field: KnowledgeField) {
    if (!field.id) { setError("字段缺少服务器ID，无法修改；请刷新资料后重试"); return; }
    const next = { ...field, active: !field.active };
    if (field.active && !window.confirm(`确定删除字段“${field.label}”？字段将停用，历史版本数据仍会保留。`)) return;
    try {
      const updated = await requestJson<any>(`/api/product-knowledge/fields/${encodeURIComponent(field.id)}`, field.active
        ? { method: "DELETE" }
        : { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: true }) });
      const normalised = normaliseField(updated.field || updated);
      if (!normalised) throw new Error("服务器返回的字段格式不正确");
      setFields((current) => current.map((item) => item.id === field.id ? normalised : item));
      showNotice(next.active ? "字段已恢复" : "字段已删除，历史版本仍保留");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "字段修改失败，数据库未发生变更"); }
  }

  async function rollback(version: KnowledgeVersion) {
    if (!window.confirm(`确定将${categoryName(category)}资料库回滚到 V${version.version}？当前版本会保留在历史记录中。`)) return;
    try {
      await requestJson(`/api/product-knowledge/versions/${encodeURIComponent(version.id)}/rollback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: `文案资料库回滚到 V${version.version}` }) });
      showNotice(`已提交回滚到 V${version.version}`);
      await loadWorkspace();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "回滚失败，数据库未发生变更"); }
  }

  const [newField, setNewField] = useState<{ label: string; key: string; type: KnowledgeField["type"] }>({ label: "", key: "", type: "text" });

  const tabs: { key: TabKey; label: string; icon: React.ElementType; hint: string }[] = [
    { key: "generator", label: "智能文案生成", icon: Sparkles, hint: "选择型号和长度，生成可审阅文案" },
    { key: "products", label: "产品资料库", icon: Database, hint: `${activeProducts.length} 个启用型号` },
    { key: "policies", label: "活动政策", icon: Layers3, hint: "按渠道和有效期管理" },
    { key: "versions", label: "导入记录与版本管理", icon: History, hint: `${versions.length} 个版本` },
    { key: "history", label: "生成历史", icon: FileText, hint: `${copyHistory.length} 条记录` },
  ];

  return (
    <div className="copywriting-workspace">
      <div className="page-title">
        <div>
          <h2>文案生成</h2>
          <p>{categoryName(category)} · {channel === "all" ? "全部渠道" : channelName(channel)} · 产品事实与营销政策统一管理</p>
        </div>
        <button className="cw-refresh-button" onClick={() => void loadWorkspace()} disabled={loading} aria-label="刷新产品资料">
          <RefreshCw size={14} className={loading ? "cw-spin" : ""} /> 刷新资料
        </button>
      </div>
      <div className="copywriting-tabs" role="tablist" aria-label="文案工作台模块">
        {tabs.map(({ key, label, icon: Icon, hint }) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)} role="tab" aria-selected={tab === key}>
            <Icon size={16} />
            <span><b>{label}</b><small>{hint}</small></span>
          </button>
        ))}
      </div>
      {notice && <div className="cw-notice"><CheckCircle2 size={15} /> {notice}</div>}
      {error && <div className="cw-error-banner"><AlertCircle size={15} /> <span>{error}</span><button onClick={() => setError("")} aria-label="关闭提示"><X size={14} /></button></div>}
      {tab === "generator" && <GeneratorTab category={category} channel={channel} products={activeProducts} fields={activeFields} policies={policies} history={copyHistory} onHistory={(entry) => setCopyHistory((current) => [entry, ...current].slice(0, 30))} />}
      {tab === "products" && <ProductsTab category={category} products={products} fields={fields} selectedProduct={selectedProduct} activeEdit={activeEdit} importPreview={importPreview} importInputRef={importInputRef} newField={newField} setNewField={setNewField} setSelectedProduct={setSelectedProduct} setActiveEdit={setActiveEdit} setImportPreview={setImportPreview} onImportFile={onImportFile} onCommitImport={commitImport} downloadTemplate={downloadTemplate} onUpdateProduct={updateProduct} onAddField={addField} onToggleField={toggleField} onBulkDelete={bulkDeleteProducts} />}
      {tab === "policies" && <PoliciesTab category={category} products={products} policies={policies} onPolicies={setPolicies} onNotice={showNotice} />}
      {tab === "versions" && <VersionsTab category={category} versions={versions} onRollback={rollback} />}
      {tab === "history" && <HistoryTab history={copyHistory} />}
    </div>
  );
}

function GeneratorTab({ category, channel, products, fields, policies, history, onHistory }: { category: ProductCategory; channel: ChannelFilter; products: ProductKnowledge[]; fields: KnowledgeField[]; policies: Policy[]; history: CopyHistory[]; onHistory: (entry: CopyHistory) => void }) {
  const [form, setForm] = useState({ scene: "产品卖点", audience: "达人群", tone: "professional", length: "50", customLength: "", mode: "merge", intent: "", constraints: "", policy: "" });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [result, setResult] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const filteredProducts = useMemo(() => products.filter((product) => `${product.model} ${product.series} ${product.sku} ${product.promotionName}`.toLowerCase().includes(productSearch.toLowerCase())), [products, productSearch]);
  const selectedProducts = products.filter((product) => selectedIds.includes(product.id));
  const selectedPolicyText = selectedProducts.map((product) => policies.filter((policy) => policy.model === product.model && policy.status === "active" && (channel === "all" || policy.channel === "all" || policy.channel === channel)).map((policy) => `${policy.name}：${policy.content}`).join("\n")).filter(Boolean).join("\n");
  const channelLabel = channel === "all" ? "全部渠道" : channelName(channel);
  const categoryLabel = categoryName(category);
  const length = form.length === "custom" ? form.customLength : form.length;

  function toggleProduct(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function generateOne(product: ProductKnowledge | null, productIds: string[] = product ? [product.id] : [], productLabel?: string) {
    const productName = productLabel || product?.model || "未选择型号";
    const facts = product ? formatFacts(product, fields) : "未从产品资料库选择型号";
    const response = await fetch("/api/copywriting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scene: form.scene, audience: form.audience, tone: ({ professional: "专业正式", lively: "活泼生动", concise: "简洁有力", emotional: "情感共鸣" } as Record<string, string>)[form.tone] || form.tone, length: `${length}字`, product: productName, productIds, facts, policy: form.policy || selectedPolicyText, constraints: form.constraints, intent: form.intent, channel: channel === "all" ? "all" : channel, category, }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "文案生成失败");
    return safeText(payload.content);
  }

  async function handleGenerate() {
    if (generating || !form.intent.trim() || !length || !selectedProducts.length) return;
    setGenerating(true); setResult(""); setError("");
    try {
      const output: string[] = [];
      if (form.mode === "separate" && selectedProducts.length > 1) {
        for (const product of selectedProducts) output.push(`【${product.model}】\n${await generateOne(product, [product.id])}`);
      } else {
        output.push(await generateOne(selectedProducts[0], selectedProducts.map((item) => item.id), selectedProducts.map((item) => item.model).join("、")));
      }
      const content = output.join("\n\n");
      setResult(content);
      onHistory({ id: `copy-${Date.now()}`, products: selectedProducts.map((product) => product.model), length: `${length}字`, scene: form.scene, createdAt: new Date().toLocaleString("zh-CN", { hour12: false }), content });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "文案生成失败，请稍后重试"); } finally { setGenerating(false); }
  }

  return (
    <div className="generator-layout">
      <div className="panel generator-form-panel">
        <div className="cw-section-title"><div><Sparkles size={17} /><b>文案需求</b></div><small>AI 仅引用启用的产品事实，不自动编造参数</small></div>
        <div className="generator-meta-grid">
          <div><span>当前品类</span><b>{categoryLabel}</b></div><div><span>目标渠道</span><b>{channelLabel}</b></div><div><span>资料状态</span><b className="cw-status-good"><CheckCircle2 size={13} /> 已加载 {products.length} 个型号</b></div>
        </div>
        <div className="generator-config-grid">
          <label className="cw-field"><span>使用场景</span><select value={form.scene} onChange={(event) => setForm({ ...form, scene: event.target.value })}><option>产品卖点</option><option>产品政策</option><option>活动预热</option><option>平销推广</option><option>活动收尾</option></select></label>
          <label className="cw-field"><span>目标群体</span><select value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value })}><option>团长群</option><option>达人群</option><option>消费者宣传</option></select></label>
          <label className="cw-field"><span>表达风格</span><select value={form.tone} onChange={(event) => setForm({ ...form, tone: event.target.value })}><option value="professional">专业正式</option><option value="lively">活泼生动</option><option value="concise">简洁有力</option><option value="emotional">情感共鸣</option></select></label>
          <label className="cw-field"><span>文案长度</span><select value={form.length} onChange={(event) => setForm({ ...form, length: event.target.value })}><option value="50">50字（群发短文案）</option><option value="100">100字（精简版）</option><option value="200">200字（标准版）</option><option value="custom">自定义字数</option></select></label>
          {form.length === "custom" && <label className="cw-field"><span>自定义字数</span><input value={form.customLength} onChange={(event) => setForm({ ...form, customLength: event.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="例如 160" inputMode="numeric" /></label>}
          {selectedIds.length > 1 && <label className="cw-field"><span>多型号生成方式</span><select value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value })}><option value="merge">合并生成一条</option><option value="separate">每个型号分别生成</option></select></label>}
        </div>
        <div className="cw-product-select-wrap">
          <span className="cw-field-label">选择产品型号 <i>*</i></span>
          <button className="cw-product-trigger" onClick={() => setPickerOpen((open) => !open)} aria-expanded={pickerOpen}><span>{selectedProducts.length ? `已选择 ${selectedProducts.length} 个型号` : "搜索并选择一个或多个型号"}</span><ChevronDown size={15} /></button>
          {selectedProducts.length > 0 && <div className="cw-selected-chips">{selectedProducts.map((product) => <button key={product.id} onClick={() => toggleProduct(product.id)}>{product.model}<X size={12} /></button>)}</div>}
          {pickerOpen && <div className="cw-product-menu"><div className="cw-product-search"><Search size={14} /><input autoFocus value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="搜索型号、推广名、系列或SKU" /></div><div className="cw-product-options">{filteredProducts.length ? filteredProducts.map((product) => <button key={product.id} className={selectedIds.includes(product.id) ? "selected" : ""} onClick={() => toggleProduct(product.id)}><span className="cw-check-box">{selectedIds.includes(product.id) && <Check size={12} />}</span><span><b>{product.promotionName || "未填写推广名"}</b><small>型号：{product.model}</small><small>{product.series || "未分系列"} · {product.sku || "无SKU"}</small></span></button>) : <div className="cw-product-empty">没有匹配的启用型号，请先在产品资料库维护</div>}</div><div className="cw-product-menu-footer"><span>可多选，生成时会自动引用对应资料版本</span><button onClick={() => setPickerOpen(false)}>完成选择</button></div></div>}
        </div>
        <div className="cw-form-grid">
          <label className="cw-field cw-wide"><span>活动政策与价格依据</span><textarea value={form.policy} onChange={(event) => setForm({ ...form, policy: event.target.value })} placeholder={selectedPolicyText ? "已自动带入当前有效政策，可补充本次要求" : "填写优惠、佣金、补贴及有效期；不确定可留空"} /></label>
          <label className="cw-field"><span>时间/地区/适用条件</span><input value={form.constraints} onChange={(event) => setForm({ ...form, constraints: event.target.value })} placeholder="例如：9月1日至9月7日，仅限京东" /></label>
          <label className="cw-field cw-wide"><span>希望如何生成 <i>*</i></span><textarea value={form.intent} onChange={(event) => setForm({ ...form, intent: event.target.value })} placeholder="例如：突出高刷和游戏体验，适合直接发达人群，结尾带行动号召" /></label>
        </div>
        {error && <div className="cw-inline-error"><AlertCircle size={14} /> {error}</div>}
        <div className="generator-actions"><button className="primary cw-generate-btn" onClick={() => void handleGenerate()} disabled={generating || !form.intent.trim() || !selectedProducts.length || !length}>{generating ? <><LoaderCircle size={15} className="cw-spin" /> 生成中…</> : <><Sparkles size={15} /> 生成文案</>}</button><small>生成前请确认型号资料和政策已审核；50字为近似长度控制</small></div>
      </div>
      <div className="generator-result-column">
        {result ? <div className="panel copywriting-result"><div className="panel-head"><div><h3>生成结果</h3><p>{selectedProducts.map((product) => product.model).join("、")} · {length}字 · 待人工终审</p></div><button onClick={async () => { await navigator.clipboard.writeText(result); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }}><Copy size={14} /> {copied ? "已复制" : "复制文案"}</button></div><div className="cw-result-content"><pre>{result}</pre></div><div className="cw-review-note"><AlertCircle size={14} /> 生成结果已记录资料版本，发布前请人工核对参数、价格和活动政策。</div></div> : <div className="copywriting-empty"><FileText size={42} /><h3>等待生成文案</h3><p>先选择一个或多个型号，设定长度和使用场景，系统会自动引用产品资料库。</p><div className="cw-empty-facts"><CheckCircle2 size={14} /> 已启用防编造校验</div></div>}
        {!!history.length && <div className="panel generator-recent"><div className="panel-head"><div><h3>最近生成</h3><p>可在“生成历史”中查看完整记录</p></div></div>{history.slice(0, 3).map((item) => <button key={item.id} onClick={() => setResult(item.content)}><span>{item.products.join("、")}</span><small>{item.length} · {item.createdAt}</small></button>)}</div>}
      </div>
    </div>
  );
}

function ProductsTab({ category, products, fields, selectedProduct, activeEdit, importPreview, importInputRef, newField, setNewField, setSelectedProduct, setActiveEdit, setImportPreview, onImportFile, onCommitImport, downloadTemplate, onUpdateProduct, onAddField, onToggleField, onBulkDelete }: any) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const filtered = products.filter((product: ProductKnowledge) => `${product.model} ${product.series} ${product.sku} ${product.promotionName}`.toLowerCase().includes(query.toLowerCase()));
  const filteredIds = filtered.map((product: ProductKnowledge) => product.id);
  const selectedVisibleCount = filteredIds.filter((id: string) => selectedIds.includes(id)).length;
  const allVisibleSelected = filteredIds.length > 0 && selectedVisibleCount === filteredIds.length;

  useEffect(() => {
    const productIds = new Set(products.map((product: ProductKnowledge) => product.id));
    setSelectedIds((current) => current.filter((id) => productIds.has(id)));
  }, [products]);

  useEffect(() => {
    // A category switch is a new selection context.  Do not carry UUIDs from
    // the previous catalog into the next one, even while its request loads.
    setSelectedIds([]);
    setQuery("");
  }, [category]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedVisibleCount > 0 && !allVisibleSelected;
    }
  }, [selectedVisibleCount, allVisibleSelected]);

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAllVisible() {
    if (deleting) return;
    setSelectedIds((current) => {
      if (allVisibleSelected) return current.filter((id) => !filteredIds.includes(id));
      return [...new Set([...current, ...filteredIds])];
    });
  }

  async function handleBulkDelete() {
    if (deleting || !selectedIds.length) return;
    const confirmed = window.confirm(`确定批量删除已选的 ${selectedIds.length} 条产品资料？\n\n系统将执行安全停用，历史版本和参数不会物理删除；停用型号也不会再出现在文案生成的默认选择中。`);
    if (!confirmed) return;
    setDeleting(true);
    try {
      await onBulkDelete(selectedIds);
      setSelectedIds([]);
      setSelectedProduct(null);
      setActiveEdit(null);
    } catch {
      // The parent displays the server error; keep the selection for retry.
    } finally {
      setDeleting(false);
    }
  }

  const newFieldTypes: { value: KnowledgeField["type"]; label: string }[] = [{ value: "text", label: "文本" }, { value: "number", label: "数字" }, { value: "date", label: "日期" }, { value: "select", label: "单选" }, { value: "multiselect", label: "多选" }, { value: "longtext", label: "长文本" }];
  return <div className="product-library-layout">
    <div className="panel product-library-panel">
      <div className="library-toolbar"><div className="cw-search-input"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索型号、系列、SKU" /></div><div className="library-actions"><button onClick={downloadTemplate}><Download size={14} /> 下载当前模板</button><button onClick={() => importInputRef.current?.click()}><Upload size={14} /> 导入并预览</button><button className="pk-bulk-delete" onClick={() => void handleBulkDelete()} disabled={!selectedIds.length || deleting} title="批量安全停用，历史版本会保留"><Trash2 size={14} /> {deleting ? "处理中…" : `批量删除${selectedIds.length ? `（${selectedIds.length}）` : ""}`}</button><input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onImportFile} /></div></div>
      {selectedIds.length > 0 && <div className="pk-selection-bar"><span><CheckCircle2 size={14} /> 已选择 <b>{selectedIds.length}</b> 条产品资料 · 当前筛选结果 {filtered.length} 条</span><button onClick={() => setSelectedIds([])} disabled={deleting}>清空选择</button></div>}
      <div className="library-summary"><div><span>启用型号</span><b>{products.filter((item: ProductKnowledge) => item.status === "active").length}</b></div><div><span>自定义字段</span><b>{fields.filter((field: KnowledgeField) => field.active).length}</b></div><div><span>当前品类</span><b>{categoryName(category)}</b></div><div className="library-help"><Database size={15} /> 参数表按型号覆盖；未出现在表中的旧型号保留</div></div>
      <div className="pk-table-wrap"><table className="pk-table"><thead><tr><th className="pk-select-col"><input ref={selectAllRef} type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} disabled={!filtered.length || deleting} aria-label="全选当前筛选结果" /></th><th>产品系列</th><th>标准型号</th><th>SKU</th><th>推广名</th><th>版本</th><th>更新时间</th><th>状态</th><th>操作</th></tr></thead><tbody>{filtered.length ? filtered.map((product: ProductKnowledge) => <tr key={product.id} className={`${selectedProduct?.id === product.id ? "selected" : ""} ${selectedIds.includes(product.id) ? "checked" : ""}`} onClick={() => setSelectedProduct(product)}><td className="pk-select-col" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(product.id)} onChange={() => toggleSelected(product.id)} disabled={deleting} aria-label={`选择${product.model}`} /></td><td>{product.series || "—"}</td><td><b>{product.model}</b></td><td>{product.sku || "—"}</td><td>{product.promotionName || "—"}</td><td>V{product.version}</td><td>{product.updatedAt}</td><td><span className={`pk-status ${product.status}`}>{product.status === "active" ? "启用" : "停用"}</span></td><td><button className="pk-row-action" onClick={(event) => { event.stopPropagation(); setActiveEdit(product); }}><Pencil size={13} /> 编辑</button></td></tr>) : <tr><td colSpan={9} className="pk-empty">暂无匹配资料</td></tr>}</tbody></table></div>
      {importPreview && <ImportPreviewPanel preview={importPreview} setPreview={setImportPreview} onCommit={onCommitImport} />}
    </div>
    <aside className="product-side-column">
      <ProductDetail product={activeEdit || selectedProduct} fields={fields} editing={Boolean(activeEdit)} onEdit={() => selectedProduct && setActiveEdit(selectedProduct)} onCancel={() => setActiveEdit(null)} onSave={onUpdateProduct} />
      <div className="panel field-management-panel"><div className="panel-head"><div><h3>自定义字段</h3><p>字段会同步到模板和文案知识引用</p></div><Settings2 size={16} /></div><div className="field-list">{fields.map((field: KnowledgeField) => <div key={field.key} className={!field.active ? "disabled" : ""}><span><b>{field.label}</b><small>{field.key} · {field.type}</small></span><button onClick={() => onToggleField(field)}>{field.active ? "删除" : "恢复"}</button></div>)}</div><div className="field-add-form"><input value={newField.label} onChange={(event) => setNewField({ ...newField, label: event.target.value })} placeholder="字段名称，如屏幕尺寸" /><input value={newField.key} onChange={(event) => setNewField({ ...newField, key: event.target.value })} placeholder="字段标识（可选）" /><select value={newField.type} onChange={(event) => setNewField({ ...newField, type: event.target.value as KnowledgeField["type"] })}>{newFieldTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select><button className="primary" onClick={onAddField}><Plus size={14} /> 添加字段</button></div><small className="field-management-note"><ArchiveRestore size={13} /> 删除仅停用字段，历史数据仍保留，不影响旧版本回滚。</small></div>
    </aside>
  </div>;
}

function ProductDetail({ product, fields, editing, onEdit, onCancel, onSave }: { product: ProductKnowledge | null; fields: KnowledgeField[]; editing: boolean; onEdit: () => void; onCancel: () => void; onSave: (product: ProductKnowledge) => void }) {
  const [draft, setDraft] = useState<ProductKnowledge | null>(product);
  useEffect(() => setDraft(product), [product]);
  if (!product || !draft) return <div className="panel product-detail-empty"><Database size={28} /><b>选择一条产品资料</b><span>查看参数、卖点和当前有效版本</span></div>;
  const setValue = (key: keyof ProductKnowledge, value: string) => setDraft({ ...draft, [key]: value });
  const setField = (key: string, value: string) => setDraft({ ...draft, fields: { ...draft.fields, [key]: value } });
  return <div className="panel product-detail-panel"><div className="panel-head"><div><span className="detail-eyebrow">当前资料 · V{product.version}</span><h3>{product.model}</h3><p>{product.series || "未分系列"} · {product.sku || "无SKU"}</p></div>{editing ? <button className="detail-close" onClick={onCancel}><X size={14} /></button> : <button className="detail-edit" onClick={onEdit}><Pencil size={13} /> 编辑</button>}</div>{editing ? <div className="detail-form"><label><span>产品系列</span><input value={draft.series} onChange={(event) => setValue("series", event.target.value)} /></label><label><span>标准型号</span><input value={draft.model} onChange={(event) => setValue("model", event.target.value)} /></label><label><span>SKU</span><input value={draft.sku} onChange={(event) => setValue("sku", event.target.value)} /></label><label><span>推广名</span><input value={draft.promotionName} onChange={(event) => setValue("promotionName", event.target.value)} /></label>{fields.filter((field) => field.active).map((field) => <label key={field.key} className={field.type === "longtext" ? "wide" : ""}><span>{field.label}</span>{field.type === "longtext" ? <textarea value={draft.fields[field.key] || ""} onChange={(event) => setField(field.key, event.target.value)} /> : <input value={draft.fields[field.key] || ""} onChange={(event) => setField(field.key, event.target.value)} />}</label>)}<div className="detail-actions"><button onClick={onCancel}>取消</button><button className="primary" onClick={() => onSave({ ...draft, version: draft.version + 1, updatedAt: new Date().toISOString().slice(0, 10) })}><Check size={14} /> 保存修改</button></div></div> : <div className="detail-facts"><div className="detail-fixed-grid"><div><span>产品系列</span><b>{product.series || "—"}</b></div><div><span>推广名</span><b>{product.promotionName || "—"}</b></div><div><span>SKU</span><b>{product.sku || "—"}</b></div><div><span>更新时间</span><b>{product.updatedAt}</b></div></div><div className="detail-field-list">{fields.filter((field) => field.active).map((field) => <div key={field.key}><span>{field.label}</span><p>{product.fields[field.key] || <em>待业务确认</em>}</p></div>)}</div></div>}</div>;
}

function ImportPreviewPanel({ preview, setPreview, onCommit }: { preview: ImportPreview; setPreview: (preview: ImportPreview | null) => void; onCommit: () => void }) {
  const serverSummary = preview.summary || {};
  const counts = { new: Number(serverSummary.creates ?? preview.rows.filter((row) => row.state === "new").length), update: Number(serverSummary.updates ?? preview.rows.filter((row) => row.state === "update").length), conflict: Number(serverSummary.conflicts ?? 0), error: Number(serverSummary.invalidRows ?? 0), skip: Number(serverSummary.skips ?? preview.rows.filter((row) => row.state === "skip").length) };
  const newFields = preview.newFields || serverSummary.newFields || [];
  const restoredFields = preview.restoredFields || [];
  return <div className="import-preview-card"><div className="import-preview-head"><div><b>服务端导入预览</b><span>{preview.fileName} · {Number(serverSummary.totalRows || preview.rows.length)} 行</span></div><button onClick={() => setPreview(null)} aria-label="关闭导入预览"><X size={15} /></button></div><div className="import-preview-stats"><span className="new"><b>{counts.new}</b>新增型号</span><span className="update"><b>{counts.update}</b>覆盖型号</span><span className="conflict"><b>{counts.conflict}</b>冲突</span><span className="error"><b>{counts.error}</b>错误</span></div><div className="import-mode-row"><div><span>覆盖规则</span><strong>按表中出现的标准型号完整覆盖</strong></div><small>只覆盖本次表格中的型号；未出现在表格中的旧型号保留。表中空白单元格会清除对应型号的旧参数，新表头会在确认时自动创建字段。</small></div>{newFields.length > 0 && <div className="import-discovered-fields"><b>将新增字段</b><div>{newFields.map((field) => <span key={field.field_key}>{field.field_label}</span>)}</div></div>}{restoredFields.length > 0 && <div className="import-discovered-fields"><b>将恢复字段</b><div>{restoredFields.map((field) => <span key={field.field_key}>{field.field_label}</span>)}</div></div>}{(preview.errors?.length || preview.warnings?.length) ? <div className="import-preview-messages">{preview.errors?.slice(0, 6).map((message) => <p className="error" key={`error-${message}`}>{message}</p>)}{preview.warnings?.slice(0, 6).map((message) => <p className="warning" key={`warning-${message}`}>{message}</p>)}</div> : null}<div className="import-preview-table"><table><thead><tr><th>行</th><th>状态</th><th>标准型号</th><th>SKU</th><th>提示</th></tr></thead><tbody>{preview.rows.slice(0, 8).map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td><span className={`import-row-state ${row.state}`}>{row.state === "new" ? "新增" : row.state === "update" ? "覆盖" : row.state === "skip" ? "跳过" : row.state === "conflict" ? "冲突" : "错误"}</span></td><td>{row.values["标准型号"] || row.values.canonical_model || row.values.model || "—"}</td><td>{row.values.SKU || row.values.sku || "—"}</td><td>{row.message || "—"}</td></tr>)}</tbody></table></div><div className="import-preview-actions"><button onClick={() => setPreview(null)}>取消</button><button className="primary" onClick={onCommit} disabled={!counts.new && !counts.update}>确认覆盖 {counts.new + counts.update} 行</button></div></div>;
}

function PoliciesTab({ category, products, policies, onPolicies, onNotice }: { category: ProductCategory; products: ProductKnowledge[]; policies: Policy[]; onPolicies: (policies: Policy[]) => void; onNotice: (message: string) => void }) {
  const [draft, setDraft] = useState({ name: "", model: "", channel: "jd", validFrom: "", validTo: "", content: "" });
  const [showForm, setShowForm] = useState(false);
  async function savePolicy() {
    if (!draft.name.trim() || !draft.model.trim() || !draft.content.trim()) return;
    const product = products.find((item) => item.model === draft.model);
    if (!product) return;
    try {
      const saved = await requestJson<any>("/api/product-knowledge/policies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: product.id, policyName: draft.name, channel: draft.channel, policyData: { content: draft.content }, startsAt: draft.validFrom || null, endsAt: draft.validTo || null }) });
      const policy = normalisePolicy({ ...saved, canonical_model: product.model }, policies.length);
      onPolicies([policy, ...policies]); setDraft({ name: "", model: "", channel: "jd", validFrom: "", validTo: "", content: "" }); setShowForm(false); onNotice("活动政策已保存");
    } catch (reason) { onNotice(reason instanceof Error ? reason.message : "活动政策保存失败，数据库未发生变更"); }
  }
  return <div className="policies-layout"><div className="panel policy-panel"><div className="panel-head"><div><h3>活动政策</h3><p>价格、佣金、补贴及适用期限单独维护，避免覆盖长期产品事实</p></div><button className="primary policy-add-button" onClick={() => setShowForm((show) => !show)}><Plus size={14} /> 新增政策</button></div>{showForm && <div className="policy-form"><label><span>政策名称</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例如：9月京东联盟政策" /></label><label><span>适用型号</span><select value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })}><option value="">选择已存在的标准型号</option>{products.filter((product) => product.status === "active").map((product) => <option key={product.id} value={product.model}>{product.model}</option>)}</select></label><label><span>渠道</span><select value={draft.channel} onChange={(event) => setDraft({ ...draft, channel: event.target.value })}><option value="jd">京东</option><option value="douyin">抖音</option><option value="tmall">天猫</option><option value="all">全部渠道</option></select></label><label><span>有效期</span><div className="policy-date-fields"><input type="date" value={draft.validFrom} onChange={(event) => setDraft({ ...draft, validFrom: event.target.value })} /><i>至</i><input type="date" value={draft.validTo} onChange={(event) => setDraft({ ...draft, validTo: event.target.value })} /></div></label><label className="wide"><span>政策内容</span><textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder="填写已确认的优惠、佣金及叠加规则，不确定内容请标注待确认" /></label><div className="policy-form-actions"><button onClick={() => setShowForm(false)}>取消</button><button className="primary" onClick={() => void savePolicy()}>保存政策</button></div></div>}<div className="policy-list">{policies.map((policy) => <div key={policy.id} className={policy.status === "expired" ? "expired" : ""}><div className="policy-list-head"><span className={`policy-status ${policy.status}`}>{policy.status === "active" ? "当前有效" : "已过期"}</span><small>{policy.validFrom || "未设置"} 至 {policy.validTo || "长期"}</small></div><h4>{policy.name}</h4><p>{policy.content}</p><div className="policy-list-meta"><span>{policy.model || "全品类"}</span><span>{policy.channel === "jd" ? "京东" : policy.channel === "douyin" ? "抖音" : policy.channel === "tmall" ? "天猫" : "全部渠道"}</span></div></div>)}</div></div><div className="panel policy-rules"><div className="panel-head"><div><h3>使用规则</h3><p>生成文案时仅带入当前品类与有效期内的政策</p></div><CalendarDays size={17} /></div><div className="policy-rule-item"><CheckCircle2 size={15} /><span>过期政策自动排除，不参与AI引用</span></div><div className="policy-rule-item"><CheckCircle2 size={15} /><span>价格叠加关系不明确时，文案会标记待业务确认</span></div><div className="policy-rule-item"><CheckCircle2 size={15} /><span>政策与产品资料版本独立，可分别回滚</span></div></div></div>;
}

function VersionsTab({ category, versions, onRollback }: { category: ProductCategory; versions: KnowledgeVersion[]; onRollback: (version: KnowledgeVersion) => void }) {
  return <div className="panel versions-panel"><div className="panel-head"><div><h3>导入记录与版本管理</h3><p>{categoryName(category)}产品资料每次导入都会生成新版本，旧资料不会被物理删除。</p></div><span className="version-safe-badge"><ArchiveRestore size={14} /> 可回滚</span></div><div className="version-timeline">{versions.map((version) => <div key={version.id} className={version.status === "active" ? "active" : ""}><div className="version-marker"><span>{version.status === "active" ? <Check size={14} /> : version.version}</span></div><div className="version-card"><div><b>V{version.version} · {version.fileName}</b><small>{version.createdAt} · {version.createdBy} · {version.rowCount} 条资料</small></div><div><span className={`version-status ${version.status}`}>{version.status === "active" ? "当前生效" : "历史版本"}</span>{version.status !== "active" && <button onClick={() => onRollback(version)}><RotateCcw size={13} /> 回滚</button>}</div></div></div>)}</div></div>;
}

function HistoryTab({ history }: { history: CopyHistory[] }) {
  return <div className="panel copy-history-panel"><div className="panel-head"><div><h3>生成历史</h3><p>记录文案所引用的型号、资料版本和文案长度，可跨设备复核。</p></div><History size={17} /></div>{history.length ? <div className="copy-history-list">{history.map((item) => <details key={item.id}><summary><span><b>{item.products.join("、")}</b><small>{item.scene} · {item.length} · {item.createdAt}</small></span><ChevronDown size={14} /></summary><div><pre>{item.content}</pre><button onClick={() => void navigator.clipboard.writeText(item.content)}><Copy size={13} /> 复制</button></div></details>)}</div> : <div className="history-empty"><History size={30} /><b>暂无生成记录</b><span>完成一次文案生成后，可在这里复核引用的型号和资料版本。</span></div>}</div>;
}
