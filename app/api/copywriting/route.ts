import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
// 文案生成可能比普通接口耗时更长；同时保留明确的总预算，避免请求无限占用服务端资源。
export const maxDuration = 180;

const clean = (value: unknown, max = 3000) => typeof value === "string" ? value.trim().slice(0, max) : "";

const boundedEnvNumber = (name: string, fallback: number, min: number, max: number) => {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const ATTEMPT_TIMEOUT_MS = boundedEnvNumber("COPYWRITING_AI_TIMEOUT_MS", 90_000, 30_000, 120_000);
const TOTAL_BUDGET_MS = boundedEnvNumber("COPYWRITING_AI_TOTAL_TIMEOUT_MS", 150_000, ATTEMPT_TIMEOUT_MS, 165_000);
const MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 1_200;
const MAX_RETRY_DELAY_MS = 4_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function idsFromBody(body: Record<string, unknown>, key: string, singular: string) {
  const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
  const candidate = body[key] ?? body[snakeKey] ?? body[`${key.replace(/Ids$/, "_ids")}`] ?? body[singular];
  const nested = Array.isArray(body.products)
    ? body.products.map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      return key === "productVersionIds" ? (record.productVersionId ?? record.product_version_id ?? record.versionId ?? record.currentVersionId) : record[singular];
    })
    : [];
  const values = Array.isArray(candidate) ? candidate : candidate ? [candidate] : nested;
  return [...new Set(values.filter((value): value is string => typeof value === "string" && UUID_RE.test(value)))];
}

async function saveGenerationHistory(
  body: Record<string, unknown>,
  data: Record<string, string>,
  resultText: string,
  userId: string,
) {
  const productIds = idsFromBody(body, "productIds", "productId");
  const requestedVersionIds = idsFromBody(body, "productVersionIds", "productVersionId");
  let versionIds = requestedVersionIds;
  if (productIds.length && !versionIds.length) {
    const { rows } = await pool.query<{ current_version_id: string | null }>(
      `select current_version_id from public.product_knowledge_products
        where id = any($1::uuid[]) order by array_position($1::uuid[], id)`, [productIds],
    );
    versionIds = rows.map((row) => row.current_version_id).filter((value): value is string => Boolean(value));
  }
  const category = data.category === "tv" || data.category === "monitor" ? data.category : null;
  const channel = ["all", "jd", "douyin", "tmall"].includes(data.channel) ? data.channel : null;
  const requestConfig = {
    scene: data.scene, audience: data.audience, channel: data.channel, category: data.category,
    product: data.product, facts: data.facts, policy: data.policy, constraints: data.constraints,
    intent: data.intent, tone: data.tone, length: data.length,
  };
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.copywriting_generations
      (created_by, product_category, channel, product_ids, product_version_ids, request_config, result_text)
     values ($1, $2, $3, $4::uuid[], $5::uuid[], $6::jsonb, $7)
     returning id`,
    [userId, category, channel, productIds, versionIds, JSON.stringify(requestConfig), resultText.slice(0, 50_000)],
  );
  return rows[0]?.id || null;
}

async function loadProductGrounding(body: Record<string, unknown>, category: string, channel: string) {
  const productIds = idsFromBody(body, "productIds", "productId");
  if (!productIds.length || (category !== "tv" && category !== "monitor")) {
    return { requestedIds: productIds, productIds: [] as string[], productNames: "", facts: "", policy: "", versionIds: [] as string[] };
  }
  try {
    const [productsResult, fieldsResult, policiesResult] = await Promise.all([
      pool.query<{
        id: string; current_version_id: string | null; canonical_model: string; product_series: string | null; sku: string | null;
        promotion_name: string | null; custom_values: Record<string, unknown>;
      }>(
        `select id, current_version_id, canonical_model, product_series, sku, promotion_name, custom_values
           from public.product_knowledge_products
          where id = any($1::uuid[]) and product_category = $2 and status = 'active'`, [productIds, category],
      ),
      (category === "tv" || category === "monitor")
        ? pool.query<{ field_key: string; field_label: string }>(
          `select field_key, field_label from public.product_knowledge_fields
            where product_category = $1 and active = true`, [category],
        )
        : Promise.resolve({ rows: [] as { field_key: string; field_label: string }[] }),
      pool.query<{
        canonical_model: string; policy_name: string; channel: string; policy_data: Record<string, unknown>;
        starts_at: string | null; ends_at: string | null;
      }>(
        `select k.canonical_model, p.policy_name, p.channel, p.policy_data, p.starts_at, p.ends_at
           from public.product_knowledge_policies p
           join public.product_knowledge_products k on k.id = p.product_id
          where p.product_id = any($1::uuid[]) and p.status = 'active'
            and (p.starts_at is null or p.starts_at <= now())
            and (p.ends_at is null or p.ends_at >= now())
            and ($2 = '' or p.channel = 'all' or p.channel = $2)`, [productIds, channel || ""],
      ),
    ]);
    const labels = new Map(fieldsResult.rows.map((field) => [field.field_key, field.field_label]));
    const products = productsResult.rows;
    const productNames = products.map((product) => product.canonical_model).join("、");
    const facts = products.map((product) => {
      const custom = Object.entries(product.custom_values || {})
        .map(([key, value]) => `${labels.get(key) || key}：${typeof value === "string" ? value : JSON.stringify(value)}`)
        .join("；");
      return [
        `型号：${product.canonical_model}`,
        product.product_series ? `系列：${product.product_series}` : "",
        product.sku ? `SKU：${product.sku}` : "",
        product.promotion_name ? `推广名：${product.promotion_name}` : "",
        custom,
      ].filter(Boolean).join("；");
    }).join("\n").slice(0, 12_000);
    const policy = policiesResult.rows.map((item) => {
      const values = Object.entries(item.policy_data || {}).map(([key, value]) => `${key}：${typeof value === "string" ? value : JSON.stringify(value)}`).join("；");
      return `型号：${item.canonical_model}；政策：${item.policy_name}；渠道：${item.channel}${values ? `；${values}` : ""}`;
    }).join("\n").slice(0, 8_000);
    return { requestedIds: productIds, productIds: products.map((product) => product.id), productNames, facts, policy, versionIds: products.map((product) => product.current_version_id).filter((value): value is string => Boolean(value)) };
  } catch (error) {
    console.error("[copywriting] failed to load product knowledge", error);
    throw new Error("PRODUCT_KNOWLEDGE_UNAVAILABLE");
  }
}

function sceneWritingStrategy(scene: string) {
  if (/降价|补贴|优惠|促销|政策/.test(scene)) {
    return "这是价格或政策场景：在价格和条件均有已核验依据时，语气要有明显的惊喜感、爆发力和行动感；突出价格变化、优惠幅度和截止条件。可以有节奏感和少量感叹号，但不得虚构低价、库存、稀缺性或优惠叠加。";
  }
  if (/卖点|产品|平销/.test(scene)) {
    return "这是产品卖点场景：优先选取资料库中1至3个最有决策价值的已核验参数，按“参数→功能能力→使用体验→用户利益”转译；语气有感染力但不堆参数、不夸大效果。";
  }
  if (/预热/.test(scene)) {
    return "这是活动预热场景：营造期待感，优先交代已核验的产品亮点、活动时间和参与条件；没有明确依据时不得制造倒计时或稀缺感。";
  }
  if (/收尾/.test(scene)) {
    return "这是活动收尾场景：在结束时间和政策均已核验时增强紧迫感，并给出明确行动指引；不得凭空声称马上涨价、售罄或不再补货。";
  }
  return "根据使用场景采用自然、有感染力的销售表达，同时保持事实准确、层次清晰和行动指引明确。";
}

type UpstreamPayload = {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string } | string;
};

type Failure = {
  kind: "timeout" | "rate_limit" | "upstream" | "network";
  status?: number;
};

const isRetriableStatus = (status: number) => status === 429 || (status >= 500 && status <= 599);

const parsePayload = (raw: string): UpstreamPayload => {
  try {
    return (JSON.parse(raw) || {}) as UpstreamPayload;
  } catch {
    return {};
  }
};

const upstreamErrorMessage = (payload: UpstreamPayload) => {
  if (typeof payload.error === "string") return payload.error.slice(0, 300);
  return payload.error?.message?.slice(0, 300) || "";
};

const retryAfterMs = (value: string | null) => {
  if (!value) return null;
  const seconds = Number.parseFloat(value);
  if (Number.isFinite(seconds)) return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, seconds * 1_000));
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, timestamp - Date.now()));
  return null;
};

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function requestedCopyLength(value: string) {
  if (value === "short") return 100;
  if (value === "medium") return 200;
  if (value === "long") return 350;
  const matched = value.match(/\d{1,4}/);
  if (!matched) return 200;
  return Math.min(1000, Math.max(20, Number.parseInt(matched[0], 10)));
}

function limitDraftSection(content: string, targetLength: number) {
  const startToken = "【文案草稿】";
  const endToken = "【待确认事项】";
  const start = content.indexOf(startToken);
  const end = content.indexOf(endToken, start + startToken.length);
  if (start < 0 || end < 0) return content;
  const draft = content.slice(start + startToken.length, end);
  let count = 0;
  let limited = "";
  for (const character of draft) {
    if (!/\s/u.test(character)) count += 1;
    if (count > targetLength) break;
    limited += character;
  }
  if (count <= targetLength) return content;
  return `${content.slice(0, start + startToken.length)}${limited.trimEnd()}\n${content.slice(end)}`;
}

function ensureDraftModels(content: string, productNames: string) {
  const startToken = "【文案草稿】";
  const start = content.indexOf(startToken);
  if (start < 0 || !productNames || content.slice(start).includes(productNames)) return content;
  const insertAt = start + startToken.length;
  return `${content.slice(0, insertAt)}\n型号：${productNames}\n${content.slice(insertAt).trimStart()}`;
}

const failureResponse = (failure: Failure) => {
  if (failure.kind === "timeout") {
    return NextResponse.json({
      error: "AI 生成耗时较长，已达到等待上限，请缩短输入内容后重试",
      code: "AI_TIMEOUT",
    }, { status: 504 });
  }
  if (failure.kind === "rate_limit") {
    return NextResponse.json({
      error: "AI 服务当前请求较多，请稍后重试",
      code: "AI_RATE_LIMITED",
    }, { status: 429 });
  }
  if (failure.kind === "network") {
    return NextResponse.json({
      error: "无法连接 AI 服务，请稍后重试",
      code: "AI_NETWORK_ERROR",
    }, { status: 502 });
  }
  return NextResponse.json({
    error: failure.status ? `AI 上游服务暂时不可用（HTTP ${failure.status}），请稍后重试` : "AI 上游服务暂时不可用，请稍后重试",
    code: "AI_UPSTREAM_ERROR",
  }, { status: 502 });
};

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  // The dedicated Turing variables are preferred. DEEPSEEK_API_KEY remains only
  // as a legacy fallback for existing deployments and is not recommended.
  const apiKey = process.env.COPYWRITING_AI_API_KEY || process.env.DEEPSEEK_API_KEY;
  const baseUrl = (process.env.COPYWRITING_AI_BASE_URL || "https://live-turing.cn.llm.tcljd.com/api/v1").replace(/\/$/, "");
  // Turing 官方模型列表中的字节火山轻量模型，适合低延迟文案生成；仍可通过环境变量覆盖。
  const model = process.env.COPYWRITING_AI_MODEL || "doubao-seed-2-0-mini-260215";
  if (!apiKey) return NextResponse.json({ error: "文案智能体尚未配置，请联系管理员配置 AI 服务" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式不正确" }, { status: 400 }); }
  let data = {
    scene: clean(body.scene, 30), audience: clean(body.audience, 30), channel: clean(body.channel, 30), category: clean(body.category, 30),
    product: clean(body.product, 200), facts: clean(body.facts, 8_000), policy: clean(body.policy, 8_000), constraints: clean(body.constraints, 1_000),
    intent: clean(body.intent), tone: clean(body.tone, 30), length: clean(body.length, 20),
  };
  // When the UI sends product IDs, load only current active product facts and
  // currently effective policies. This grounds the model and keeps old/disabled
  // information out of newly generated copy.
  let grounding: Awaited<ReturnType<typeof loadProductGrounding>>;
  try {
    grounding = await loadProductGrounding(body, data.category, data.channel);
  } catch {
    return NextResponse.json({ error: "产品资料库暂时无法核验，请稍后重试；为避免生成错误参数，本次未生成文案", code: "PRODUCT_KNOWLEDGE_UNAVAILABLE" }, { status: 503 });
  }
  if (!grounding.requestedIds.length) {
    return NextResponse.json({ error: "请先从产品资料库选择型号，系统核验参数后才能生成文案", code: "PRODUCT_REQUIRED" }, { status: 400 });
  }
  if (grounding.productIds.length !== grounding.requestedIds.length) {
    return NextResponse.json({ error: "所选产品中存在已停用、已删除或品类不匹配的资料，请刷新产品列表后重新选择", code: "PRODUCT_VERIFICATION_FAILED" }, { status: 409 });
  }
  const userSupplementalFacts = data.facts;
  const userSupplementalPolicy = data.policy;
  data = {
    ...data,
    product: grounding.productNames,
    // Product IDs are the trust boundary. Never promote client-supplied facts
    // to verified evidence; the server reloads the current active version.
    facts: grounding.facts,
    policy: grounding.policy,
  };
  if (!data.product || !data.intent) return NextResponse.json({ error: "请填写产品型号和生成要求" }, { status: 400 });

  // 豆包 Seed 的 max_completion_tokens 包含最终回答与推理总和；文案场景无需深度推理，
  // 关闭思考可显著降低首字节等待和无效 token 消耗。按界面选择的长度控制输出预算，避免
  // 为短文案预留过大的生成空间。模型仍可通过 COPYWRITING_AI_MODEL 环境变量覆盖。
  const targetLength = requestedCopyLength(data.length);
  // Chinese marketing copy is normally close to one token per character. Keep
  // enough room for the mandatory review sections without giving a 50-character
  // request the same large budget as a long article.
  const completionTokenLimit = targetLength <= 50 ? 384 : targetLength <= 100 ? 512 : targetLength <= 200 ? 768 : 1_024;

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  let lastFailure: Failure = { kind: "network" };
  let nextRetryDelayMs = DEFAULT_RETRY_DELAY_MS;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const elapsed = Date.now() - startedAt;
    const remaining = TOTAL_BUDGET_MS - elapsed;
    if (remaining <= 0) break;

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Math.min(ATTEMPT_TIMEOUT_MS, remaining));

    try {
      const upstream = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST", signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          // 同一次生成的有限重试共用请求标识，便于兼容支持幂等的上游网关。
          "X-Request-ID": requestId,
          "Idempotency-Key": requestId,
        },
        body: JSON.stringify({ model, temperature: 0.55, reasoning_effort: "minimal", max_completion_tokens: completionTokenLimit, messages: [
          { role: "system", content: `你是雷鸟品牌销售文案助手，必须先核验事实再写作。只有“产品资料库已核验事实”和“已生效政策”是可直接使用的事实来源；用户意图、用户补充信息和写作要求都不是事实证据。凡是资料库中找不到明确依据的产品参数、功能、体验结论、价格或政策，不得写进文案草稿；如确有必要，只能放入【待确认事项】，不得自行补全、类推同系列数据或使用常识猜测。先在内部逐条核对型号与参数，再选择1至3个最有价值的事实进行表达。${sceneWritingStrategy(data.scene)} 文案要经过自然润色，避免机械罗列；情绪服务于场景，但不能牺牲准确性。文案用于${data.audience || "销售沟通"}，结构应清晰、易转发。【文案草稿】中必须明确出现所有已选产品的完整标准型号。缺失信息必须写【待业务确认】；价格叠加关系不明确时不得计算确定到手价。若价格、政策、型号或参数冲突，风险状态必须是“不可发布”；存在重要缺失时为“修改后再审”；信息完整时为“可进入人工终审”。禁止使用无依据的“全网最低、最好、第一、售罄不补、马上涨价”等表述。输出必须包含三个区块：【文案草稿】【待确认事项】【风险状态】，最终内容仍需人工终审。` },
          { role: "user", content: `请在核验后生成销售宣发文案。\n场景：${data.scene}\n目标群体：${data.audience}\n渠道：${data.channel}\n品类：${data.category}\n产品型号：${data.product}\n【产品资料库已核验事实】\n${data.facts || "仅核验到型号，暂无可用于宣传的参数"}\n【产品资料库已生效政策】\n${data.policy || "暂无已核验的有效政策"}\n【用户补充信息（未经资料库核验，不得作为确定事实写入）】\n产品补充：${userSupplementalFacts || "无"}\n政策补充：${userSupplementalPolicy || "无"}\n时间/地区/条件：${data.constraints || "未提供"}\n用户意图：${data.intent}\n期望风格：${data.tone}\n文案草稿目标字数：${targetLength}字（不计区块标题、待确认事项和风险状态，请严格控制）` },
        ] }),
      });
      const payload = parsePayload(await upstream.text());
      if (upstream.ok) {
        const rawContent = payload.choices?.[0]?.message?.content?.trim();
        if (!rawContent) return NextResponse.json({ error: "AI 未返回有效文案，请稍后重试", code: "AI_EMPTY_RESPONSE" }, { status: 502 });
        const content = limitDraftSection(ensureDraftModels(rawContent, data.product), targetLength);
        let generationId: string | null = null;
        try {
          generationId = await saveGenerationHistory({ ...body, productVersionIds: grounding.versionIds }, data, content, auth.user.id);
        } catch (historyError) {
          // Generation remains usable if a deployment has not applied the optional
          // history migration yet; the server log makes the migration gap visible.
          console.error("[copywriting] failed to persist generation history", historyError);
        }
        return NextResponse.json({ content, generationId });
      }

      if (isRetriableStatus(upstream.status)) {
        lastFailure = { kind: upstream.status === 429 ? "rate_limit" : "upstream", status: upstream.status };
        nextRetryDelayMs = retryAfterMs(upstream.headers.get("retry-after"))
          ?? (lastFailure.kind === "rate_limit" ? DEFAULT_RETRY_DELAY_MS * 2 : DEFAULT_RETRY_DELAY_MS);
        console.warn("[copywriting] retriable upstream response", { requestId, attempt: attempt + 1, status: upstream.status });
      } else {
        // 认证、模型或请求参数错误不重试，避免无意义的重复调用。
        const message = upstreamErrorMessage(payload);
        if (upstream.status === 401 || upstream.status === 403) {
          return NextResponse.json({ error: "AI 服务认证失败，请联系管理员检查配置", code: "AI_AUTH_ERROR" }, { status: 502 });
        }
        return NextResponse.json({
          error: message ? `AI 服务拒绝了请求：${message}` : `AI 服务拒绝了请求（HTTP ${upstream.status}）`,
          code: "AI_REQUEST_REJECTED",
        }, { status: 502 });
      }
    } catch (error) {
      if (timedOut || (error instanceof Error && error.name === "AbortError")) {
        lastFailure = { kind: "timeout" };
        console.warn("[copywriting] upstream timeout", { requestId, attempt: attempt + 1 });
      } else {
        lastFailure = { kind: "network" };
        console.warn("[copywriting] upstream network error", { requestId, attempt: attempt + 1 });
      }
    } finally {
      clearTimeout(timer);
    }

    if (attempt >= MAX_ATTEMPTS - 1) break;
    // 网络错误不重试；仅对超时、限流和 5xx 做一次受控重试。
    if (lastFailure.kind === "network") break;
    const remainingAfterAttempt = TOTAL_BUDGET_MS - (Date.now() - startedAt);
    if (remainingAfterAttempt <= 0) break;
    if (lastFailure.kind === "timeout") nextRetryDelayMs = DEFAULT_RETRY_DELAY_MS;
    await wait(Math.min(nextRetryDelayMs, remainingAfterAttempt));
  }

  return failureResponse(lastFailure);
}
