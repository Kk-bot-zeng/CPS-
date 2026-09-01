import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";

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
  const data = {
    scene: clean(body.scene, 30), audience: clean(body.audience, 30), channel: clean(body.channel, 30), category: clean(body.category, 30),
    product: clean(body.product, 200), facts: clean(body.facts), policy: clean(body.policy), constraints: clean(body.constraints, 1000),
    intent: clean(body.intent), tone: clean(body.tone, 30), length: clean(body.length, 20),
  };
  if (!data.product || !data.intent) return NextResponse.json({ error: "请填写产品型号和生成要求" }, { status: 400 });

  // 豆包 Seed 的 max_completion_tokens 包含最终回答与推理总和；文案场景无需深度推理，
  // 关闭思考可显著降低首字节等待和无效 token 消耗。按界面选择的长度控制输出预算，避免
  // 为短文案预留过大的生成空间。模型仍可通过 COPYWRITING_AI_MODEL 环境变量覆盖。
  const completionTokenLimit = data.length === "short" ? 512 : data.length === "long" ? 1_024 : 768;

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
          { role: "system", content: `你是雷鸟品牌内部销售文案助手。文案用于团长群或达人群，结构应为：标题、一句话变化、产品/价格/政策、1至3个购买理由、限制与待确认、行动号召。只能使用用户提供的事实，不得虚构型号、参数、政策、价格、截止时间、库存、销量、排名或优惠。缺失信息必须写【待业务确认】；价格叠加关系不明确时不得计算确定到手价。若价格、政策、型号或参数相互冲突，风险状态必须是“不可发布”；存在重要缺失时为“修改后再审”；信息完整时为“可进入人工终审”。禁止使用无依据的“全网最低、最好、第一、售罄不补、马上涨价”等表述。输出必须包含三个区块：【文案草稿】【待确认事项】【风险状态】，最终内容仍需人工终审，禁止声称已自动发布。` },
          { role: "user", content: `请生成内部销售宣发文案。\n场景：${data.scene}\n目标群体：${data.audience}\n渠道：${data.channel}\n品类：${data.category}\n产品型号：${data.product}\n已确认卖点/参数：${data.facts || "未提供"}\n活动政策与价格依据：${data.policy || "未提供"}\n时间/地区/条件：${data.constraints || "未提供"}\n用户意图：${data.intent}\n风格：${data.tone}\n长度：${data.length}` },
        ] }),
      });
      const payload = parsePayload(await upstream.text());
      if (upstream.ok) {
        const content = payload.choices?.[0]?.message?.content?.trim();
        if (!content) return NextResponse.json({ error: "AI 未返回有效文案，请稍后重试", code: "AI_EMPTY_RESPONSE" }, { status: 502 });
        return NextResponse.json({ content });
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
