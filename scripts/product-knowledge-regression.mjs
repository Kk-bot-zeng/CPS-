#!/usr/bin/env node
/**
 * Local black-box regression for product knowledge and copywriting contracts.
 *
 * Safety:
 * - Only localhost/127.0.0.1 is accepted by default.
 * - Use a dedicated local database and a throw-away test account.
 * - Test products/fields/policies are uniquely named and are soft-deactivated
 *   during cleanup; the script never performs production sync or external sends.
 *
 * Usage (PowerShell):
 *   $env:PK_BASE_URL = "http://127.0.0.1:3000"
 *   $env:PK_TEST_EMAIL = "qa_admin@example.local"
 *   $env:PK_TEST_PASSWORD = "local-only-password"
 *   node scripts/product-knowledge-regression.mjs
 *
 * Optional:
 *   $env:PK_RUN_AI = "1"       # also call /api/copywriting; incurs AI cost if
 *                               # the local server points at a live provider
 *   $env:PK_ALLOW_NONLOCAL = "1" # explicit opt-in, not recommended
 */

import assert from "node:assert/strict";

const baseUrl = new URL(process.env.PK_BASE_URL || "http://127.0.0.1:3000");
const email = process.env.PK_TEST_EMAIL || "";
const password = process.env.PK_TEST_PASSWORD || "";
const allowNonLocal = process.env.PK_ALLOW_NONLOCAL === "1";
const runAi = process.env.PK_RUN_AI === "1";

if (!allowNonLocal && !["localhost", "127.0.0.1", "::1"].includes(baseUrl.hostname)) {
  throw new Error(`安全拦截：回归脚本只允许本地地址，当前为 ${baseUrl.origin}。如确需其他环境，请显式设置 PK_ALLOW_NONLOCAL=1。`);
}
if (!email || !password) {
  throw new Error("缺少 PK_TEST_EMAIL 或 PK_TEST_PASSWORD；请使用本地专用测试账号，不要把真实生产密码写入脚本。");
}

const results = [];
let sessionCookie = "";
const created = { products: [], fields: [], policies: [] };
const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const model = `QA回归型号-${stamp}`;
const monitorModel = model;
const fieldKey = `qa_peak_${Date.now().toString(36)}`.slice(0, 63);
const fieldLabel = `回归峰值亮度-${stamp}`.slice(0, 80);
const parameterModel = `QA参数表型号-${stamp}`;
const untouchedParameterModel = `QA参数表保留型号-${stamp}`;
const parameterFieldLabel = `回归参数字段-${stamp}`.slice(0, 80);
const activeMarker = `ACTIVE_POLICY_${stamp}`;
const expiredMarker = `EXPIRED_POLICY_${stamp}`;

function record(name, status, detail = "") {
  results.push({ name, status, detail });
  const mark = status === "PASS" ? "✓" : status === "SKIP" ? "-" : "✗";
  console.log(`${mark} ${status.padEnd(4)} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function cookieFrom(response) {
  const headers = response.headers;
  const values = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [headers.get("set-cookie") || ""];
  const item = values.find((value) => /(?:^|;)\s*cps_session=/.test(value));
  return item ? item.split(";", 1)[0] : "";
}

async function request(path, { method = "GET", body, auth = true, headers = {} } = {}) {
  const url = new URL(path, baseUrl);
  const requestHeaders = { Accept: "application/json", ...headers };
  let requestBody = body;
  if (body !== undefined && typeof body !== "string") {
    requestHeaders["Content-Type"] ||= "application/json";
    requestBody = JSON.stringify(body);
  }
  if (auth && sessionCookie) requestHeaders.Cookie = sessionCookie;
  const response = await fetch(url, { method, headers: requestHeaders, body: requestBody, redirect: "manual" });
  return { response, body: await readBody(response) };
}

async function expect(name, fn) {
  try {
    await fn();
    record(name, "PASS");
  } catch (error) {
    record(name, "FAIL", error instanceof Error ? error.message : String(error));
  }
}

function expectStatus(result, status) {
  assert.equal(result.response.status, status, JSON.stringify(result.body));
}

function productFrom(result) {
  const product = result.body?.product || result.body;
  assert.ok(product?.id, `响应缺少产品ID：${JSON.stringify(result.body)}`);
  return product;
}

async function postImport(mode, rows, fileName = `QA-${mode}-${stamp}.json`, options = {}) {
  const result = await request("/api/product-knowledge/import", {
    method: "POST",
    body: { action: "preview", category: "tv", mode, fileName, rows, ...options },
  });
  expectStatus(result, 201);
  assert.ok(result.body?.importId, `预览缺少 importId：${JSON.stringify(result.body)}`);
  return result.body;
}

async function listFields(category = "tv", includeInactive = true) {
  const result = await request(`/api/product-knowledge/fields?category=${encodeURIComponent(category)}&includeInactive=${includeInactive ? "true" : "false"}`);
  expectStatus(result, 200);
  return result.body.fields || [];
}

async function findProducts(category, query) {
  const result = await request(`/api/product-knowledge?category=${encodeURIComponent(category)}&q=${encodeURIComponent(query)}`);
  expectStatus(result, 200);
  return result.body.products || [];
}

async function confirmImport(importId) {
  const result = await request("/api/product-knowledge/import", {
    method: "POST",
    body: { action: "confirm", importId },
  });
  expectStatus(result, 200);
  return result.body;
}

async function getProduct(id) {
  const result = await request(`/api/product-knowledge/${encodeURIComponent(id)}`);
  expectStatus(result, 200);
  return result.body.product || result.body;
}

async function createProduct(category, canonicalModel, customValues = {}, extra = {}) {
  const result = await request("/api/product-knowledge", {
    method: "POST",
    body: {
      category,
      canonical_model: canonicalModel,
      product_series: extra.product_series || "QA回归系列",
      sku: extra.sku || `QA-SKU-${stamp}-${created.products.length}`,
      promotion_name: extra.promotion_name || canonicalModel,
      custom_values: customValues,
    },
  });
  expectStatus(result, 201);
  const product = productFrom(result);
  created.products.push(product.id);
  return product;
}

async function cleanup() {
  for (const id of created.policies) {
    await request(`/api/product-knowledge/policies/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  }
  for (const id of created.products) {
    await request(`/api/product-knowledge/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  }
  for (const id of created.fields) {
    await request(`/api/product-knowledge/fields/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  }
}

async function main() {
  console.log(`产品资料库回归：${baseUrl.origin} · 数据前缀 ${stamp}`);

  await expect("未登录请求被拒绝", async () => {
    const result = await request("/api/product-knowledge?category=tv", { auth: false });
    expectStatus(result, 401);
  });

  await expect("本地测试账号登录并取得会话", async () => {
    const result = await request("/api/auth/login", { method: "POST", auth: false, body: { email, password } });
    expectStatus(result, 200);
    sessionCookie = cookieFrom(result.response);
    assert.match(sessionCookie, /^cps_session=.+/, "登录响应缺少 cps_session Cookie");
  });

  if (!sessionCookie) throw new Error("无法继续：本地测试账号登录失败。");

  await expect("非法品类输入返回400", async () => {
    const result = await request("/api/product-knowledge?category=unknown");
    expectStatus(result, 400);
  });

  await expect("动态数字字段可以新增", async () => {
    const result = await request("/api/product-knowledge/fields", {
      method: "POST",
      body: { category: "tv", field_key: fieldKey, field_label: fieldLabel, field_type: "number" },
    });
    expectStatus(result, 201);
    assert.equal(result.body.field_key, fieldKey);
    created.fields.push(result.body.id);
  });

  let tv;
  let monitor;
  await expect("TV与显示器可以使用同名型号且互不覆盖", async () => {
    tv = await createProduct("tv", model, { [fieldKey]: 1000 }, { sku: `TV-${stamp}` });
    monitor = await createProduct("monitor", monitorModel, {}, { sku: `MON-${stamp}` });
    assert.equal(tv.product_category, "tv");
    assert.equal(monitor.product_category, "monitor");
    assert.notEqual(tv.id, monitor.id);
  });

  await expect("产品列表按品类隔离", async () => {
    const tvResult = await request("/api/product-knowledge?category=tv&q=" + encodeURIComponent(model));
    const monitorResult = await request("/api/product-knowledge?category=monitor&q=" + encodeURIComponent(model));
    expectStatus(tvResult, 200);
    expectStatus(monitorResult, 200);
    assert.ok(tvResult.body.products.some((item) => item.id === tv.id));
    assert.ok(!tvResult.body.products.some((item) => item.id === monitor.id));
    assert.ok(monitorResult.body.products.some((item) => item.id === monitor.id));
    assert.ok(!monitorResult.body.products.some((item) => item.id === tv.id));
  });

  await expect("TV模板包含动态字段、显示器模板不串入", async () => {
    const tvTemplate = await request("/api/product-knowledge/template?category=tv");
    const monitorTemplate = await request("/api/product-knowledge/template?category=monitor");
    expectStatus(tvTemplate, 200);
    expectStatus(monitorTemplate, 200);
    assert.ok(tvTemplate.body.columns.some((item) => item.key === fieldKey));
    assert.ok(!monitorTemplate.body.columns.some((item) => item.key === fieldKey));
    assert.deepEqual(tvTemplate.body.importModes.map((item) => item.value), ["insert_only", "merge", "overwrite"]);
  });

  await expect("参数表完整覆盖可按中文表头自动新增字段并导入两条型号", async () => {
    const headers = ["品类", "标准型号", "产品系列", "SKU", parameterFieldLabel];
    const preview = await postImport("overwrite", [
      { 品类: "TV", 标准型号: parameterModel, 产品系列: "参数表回归系列", SKU: `PARAM-${stamp}-A`, [parameterFieldLabel]: "旧参数A" },
      { 品类: "TV", 标准型号: untouchedParameterModel, 产品系列: "参数表回归系列", SKU: `PARAM-${stamp}-B`, [parameterFieldLabel]: "旧参数B" },
    ], `QA-parameter-table-${stamp}.xlsx`, { headers, autoCreateFields: true });
    assert.equal(preview.mode, "overwrite");
    assert.equal(preview.summary.newFields.length, 1);
    assert.equal(preview.summary.newFields[0].field_label, parameterFieldLabel);
    assert.equal(preview.newFields[0].field_label, parameterFieldLabel);
    assert.equal(preview.restoredFields.length, 0);
    await confirmImport(preview.importId);

    const fields = await listFields();
    const matching = fields.filter((field) => field.field_label === parameterFieldLabel);
    assert.equal(matching.length, 1, "自动新增字段应只有一条");
    assert.equal(matching[0].active, true);
    created.fields.push(matching[0].id);

    const products = await findProducts("tv", parameterModel);
    const untouchedProducts = await findProducts("tv", untouchedParameterModel);
    assert.equal(products.length, 1, "参数表型号A未成功入库");
    assert.equal(untouchedProducts.length, 1, "参数表型号B未成功入库");
    created.products.push(products[0].id, untouchedProducts[0].id);
    const currentA = await getProduct(products[0].id);
    const currentB = await getProduct(untouchedProducts[0].id);
    assert.equal(currentA.custom_values[matching[0].field_key], "旧参数A");
    assert.equal(currentB.custom_values[matching[0].field_key], "旧参数B");
  });

  let parameterField;
  let parameterProduct;
  let untouchedProduct;
  await expect("第二次导入相同中文表头不会重复建字段且会更新对应型号", async () => {
    const fieldsBefore = await listFields();
    parameterField = fieldsBefore.find((field) => field.field_label === parameterFieldLabel);
    assert.ok(parameterField?.id, "找不到参数表自动新增字段");
    const products = await findProducts("tv", parameterModel);
    const untouchedProducts = await findProducts("tv", untouchedParameterModel);
    parameterProduct = products[0];
    untouchedProduct = untouchedProducts[0];
    assert.ok(parameterProduct?.id && untouchedProduct?.id, "找不到参数表导入的型号");

    const preview = await postImport("overwrite", [
      { 品类: "TV", 标准型号: parameterModel, [parameterFieldLabel]: "新参数A" },
    ], `QA-parameter-table-repeat-${stamp}.xlsx`, {
      headers: ["品类", "标准型号", parameterFieldLabel],
      autoCreateFields: true,
    });
    assert.equal(preview.summary.newFields.length, 0, "相同表头不应再次新增字段");
    assert.equal(preview.newFields.length, 0);
    assert.equal(preview.restoredFields.length, 0);
    await confirmImport(preview.importId);

    const fieldsAfter = await listFields();
    assert.equal(fieldsAfter.filter((field) => field.field_label === parameterFieldLabel).length, 1, "相同中文表头产生了重复字段");
    const current = await getProduct(parameterProduct.id);
    assert.equal(current.custom_values[parameterField.field_key], "新参数A");
  });

  await expect("完整覆盖空白可清除表内型号旧值且表外旧型号保持不变", async () => {
    const preview = await postImport("overwrite", [
      { 品类: "TV", 标准型号: parameterModel, [parameterFieldLabel]: "" },
    ], `QA-parameter-table-clear-${stamp}.xlsx`, {
      headers: ["品类", "标准型号", parameterFieldLabel],
      autoCreateFields: true,
    });
    assert.equal(preview.summary.newFields.length, 0);
    await confirmImport(preview.importId);

    const current = await getProduct(parameterProduct.id);
    assert.ok(!Object.hasOwn(current.custom_values || {}, parameterField.field_key) || current.custom_values[parameterField.field_key] === null, "空白覆盖未清除型号A旧值");
    const untouched = await getProduct(untouchedProduct.id);
    assert.equal(untouched.custom_values[parameterField.field_key], "旧参数B", "未出现在本次表内的型号B被错误清除或修改");
  });

  await expect("停用同名字段后再次导入可自动恢复且不创建重复字段", async () => {
    const disabled = await request(`/api/product-knowledge/fields/${encodeURIComponent(parameterField.id)}`, { method: "DELETE" });
    expectStatus(disabled, 200);
    assert.equal(disabled.body.field.active, false);

    const preview = await postImport("overwrite", [
      { 品类: "TV", 标准型号: parameterModel, [parameterFieldLabel]: "恢复后参数A" },
    ], `QA-parameter-table-reactivate-${stamp}.xlsx`, {
      headers: ["品类", "标准型号", parameterFieldLabel],
      autoCreateFields: true,
    });
    assert.equal(preview.summary.newFields.length, 0, "停用同名字段不应重新创建字段");
    assert.equal(preview.restoredFields.length, 1);
    assert.equal(preview.restoredFields[0].field_label, parameterFieldLabel);
    await confirmImport(preview.importId);

    const fields = await listFields();
    const matching = fields.filter((field) => field.field_label === parameterFieldLabel);
    assert.equal(matching.length, 1, "恢复后出现了重复字段");
    assert.equal(matching[0].id, parameterField.id);
    assert.equal(matching[0].active, true);
    const current = await getProduct(parameterProduct.id);
    assert.equal(current.custom_values[parameterField.field_key], "恢复后参数A");
  });

  await expect("合并更新：非空字段更新、空白字段不覆盖", async () => {
    const preview = await postImport("merge", [{
      product_category: "tv",
      canonical_model: model,
      product_series: "合并后系列",
      sku: "",
      [fieldKey]: 1200,
    }]);
    assert.equal(preview.summary.updates, 1);
    await confirmImport(preview.importId);
    const current = await getProduct(tv.id);
    assert.equal(current.product_series, "合并后系列");
    assert.equal(current.sku, `TV-${stamp}`);
    assert.equal(Number(current.custom_values[fieldKey]), 1200);
  });

  await expect("合并更新不会清空已有动态字段", async () => {
    const preview = await postImport("merge", [{ product_category: "tv", canonical_model: model, [fieldKey]: "" }]);
    await confirmImport(preview.importId);
    const current = await getProduct(tv.id);
    assert.equal(Number(current.custom_values[fieldKey]), 1200);
  });

  await expect("完整覆盖：空白字段可以清除", async () => {
    const preview = await postImport("overwrite", [{
      product_category: "tv",
      canonical_model: model,
      product_series: "完整覆盖系列",
      sku: "",
      [fieldKey]: "",
    }]);
    assert.equal(preview.summary.updates, 1);
    await confirmImport(preview.importId);
    const current = await getProduct(tv.id);
    assert.equal(current.product_series, "完整覆盖系列");
    assert.equal(current.sku, null);
    assert.ok(!Object.hasOwn(current.custom_values || {}, fieldKey) || current.custom_values[fieldKey] === null);
  });

  await expect("仅新增：已有型号跳过且不修改", async () => {
    const preview = await postImport("insert_only", [{ product_category: "tv", canonical_model: model, product_series: "不应写入", [fieldKey]: 777 }]);
    assert.equal(preview.summary.skips, 1);
    await confirmImport(preview.importId);
    const current = await getProduct(tv.id);
    assert.equal(current.product_series, "完整覆盖系列");
  });

  let initialVersionId = "";
  await expect("版本列表可追溯并回滚到初始快照", async () => {
    const createdVersion = (await request(`/api/product-knowledge/${encodeURIComponent(tv.id)}`)).body.versions?.find((item) => item.source === "manual");
    assert.ok(createdVersion?.id, "找不到初始版本");
    initialVersionId = createdVersion.id;
    const versions = await request(`/api/product-knowledge/versions?productId=${encodeURIComponent(tv.id)}`);
    expectStatus(versions, 200);
    assert.ok(versions.body.versions.length >= 4);
    const rollback = await request(`/api/product-knowledge/versions/${encodeURIComponent(initialVersionId)}/rollback`, { method: "POST", body: { note: "回归测试回滚" } });
    expectStatus(rollback, 200);
    assert.equal(rollback.body.product.custom_values[fieldKey], 1000);
    assert.equal(rollback.body.product.sku, `TV-${stamp}`);
    assert.equal(rollback.body.version.source, "rollback");
  });

  let activePolicyId = "";
  let expiredPolicyId = "";
  await expect("活动政策有效期标记正确并排除过期政策", async () => {
    const now = Date.now();
    const active = await request("/api/product-knowledge/policies", {
      method: "POST",
      body: { productId: tv.id, policyName: `有效政策-${stamp}`, channel: "jd", policyData: { marker: activeMarker }, startsAt: new Date(now - 86_400_000).toISOString(), endsAt: new Date(now + 86_400_000).toISOString() },
    });
    expectStatus(active, 201);
    activePolicyId = active.body.id;
    created.policies.push(activePolicyId);
    const expired = await request("/api/product-knowledge/policies", {
      method: "POST",
      body: { productId: tv.id, policyName: `过期政策-${stamp}`, channel: "jd", policyData: { marker: expiredMarker }, startsAt: new Date(now - 3 * 86_400_000).toISOString(), endsAt: new Date(now - 86_400_000).toISOString() },
    });
    expectStatus(expired, 201);
    expiredPolicyId = expired.body.id;
    created.policies.push(expiredPolicyId);
    const policies = await request(`/api/product-knowledge/policies?productId=${encodeURIComponent(tv.id)}&channel=jd`);
    expectStatus(policies, 200);
    const current = policies.body.policies.find((item) => item.id === activePolicyId);
    const old = policies.body.policies.find((item) => item.id === expiredPolicyId);
    assert.equal(current.effective_now, true);
    assert.equal(old.effective_now, false);
  });

  await expect("字段停用保留历史定义，可重新启用", async () => {
    const disabled = await request(`/api/product-knowledge/fields/${encodeURIComponent(created.fields[0])}`, { method: "DELETE" });
    expectStatus(disabled, 200);
    assert.equal(disabled.body.field.active, false);
    const listed = await request("/api/product-knowledge/fields?category=tv&includeInactive=true");
    expectStatus(listed, 200);
    const row = listed.body.fields.find((item) => item.id === created.fields[0]);
    assert.equal(row.active, false);
    const enabled = await request(`/api/product-knowledge/fields/${encodeURIComponent(created.fields[0])}`, { method: "PATCH", body: { active: true } });
    expectStatus(enabled, 200);
    assert.equal(enabled.body.active, true);
  });

  await expect("非法JSON和超量导入返回边界错误", async () => {
    const invalidJson = await request("/api/product-knowledge", { method: "POST", body: "{" , headers: { "Content-Type": "application/json" } });
    expectStatus(invalidJson, 400);
    const oversized = await request("/api/product-knowledge/import", { method: "POST", body: { action: "preview", category: "tv", mode: "merge", rows: Array.from({ length: 20_001 }, () => ({ canonical_model: `oversized-${stamp}` })) } });
    expectStatus(oversized, 400);
  });

  await expect("非法导入模式不应静默降级", async () => {
    const result = await request("/api/product-knowledge/import", { method: "POST", body: { action: "preview", category: "tv", mode: "not-a-mode", rows: [{ canonical_model: `invalid-mode-${stamp}` }] } });
    expectStatus(result, 400);
  });

  await expect("未知字段被预览标记为错误且不直接入库", async () => {
    const unknownModel = `unknown-field-${stamp}`;
    const preview = await request("/api/product-knowledge/import", {
      method: "POST",
      body: { action: "preview", category: "tv", mode: "merge", rows: [{ product_category: "tv", canonical_model: unknownModel, unknown_qa_field: "must fail" }] },
    });
    expectStatus(preview, 400);
    assert.ok(preview.body?.errors?.some((message) => message.includes("未知") || message.includes("停用")));
    const list = await request(`/api/product-knowledge?category=tv&q=${encodeURIComponent(unknownModel)}`);
    expectStatus(list, 200);
    assert.ok(!list.body.products.some((item) => item.canonical_model === unknownModel));
  });

  if (runAi) {
    await expect("50字文案请求返回短文案且不携带过期政策", async () => {
      const result = await request("/api/copywriting", {
        method: "POST",
        body: {
          product: model,
          productIds: [tv.id],
          category: "tv",
          channel: "jd",
          scene: "产品卖点",
          audience: "达人群",
          facts: "",
          policy: "",
          intent: "只使用已确认事实，生成适合达人群的短文案",
          tone: "专业正式",
          length: "50字",
        },
      });
      expectStatus(result, 200);
      const content = String(result.body?.content || "");
      assert.ok(content, "AI 返回为空");
      assert.ok(content.includes(model), "文案未体现所选型号");
      assert.ok(!content.includes(expiredMarker), "文案引用了过期政策标记");
      const draft = content.split("【待确认事项】")[0].replace(/\s/g, "");
      assert.ok(draft.length <= 90, `50字模式输出过长：${draft.length} 字`);
    });
  } else {
    record("50字、多型号和防编造AI回归", "SKIP", "未设置 PK_RUN_AI=1；避免默认调用外部模型。请在本地 mock AI 或测试环境补跑。");
  }
}

try {
  await main();
} finally {
  if (sessionCookie) await cleanup();
}

const failed = results.filter((item) => item.status === "FAIL");
const passed = results.filter((item) => item.status === "PASS");
const skipped = results.filter((item) => item.status === "SKIP");
console.log(`\n回归结果：${passed.length} 通过，${failed.length} 失败，${skipped.length} 跳过。`);
if (failed.length) process.exitCode = 1;
