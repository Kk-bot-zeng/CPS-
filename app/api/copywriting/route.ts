import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";

export const runtime = "nodejs";

const clean = (value: unknown, max = 3000) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const apiKey = process.env.COPYWRITING_AI_API_KEY || process.env.DEEPSEEK_API_KEY;
  const baseUrl = (process.env.COPYWRITING_AI_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  const model = process.env.COPYWRITING_AI_MODEL || "deepseek-chat";
  if (!apiKey) return NextResponse.json({ error: "文案智能体尚未配置，请联系管理员配置 AI 服务" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式不正确" }, { status: 400 }); }
  const data = {
    scene: clean(body.scene, 30), audience: clean(body.audience, 30), channel: clean(body.channel, 30), category: clean(body.category, 30),
    product: clean(body.product, 200), facts: clean(body.facts), policy: clean(body.policy), constraints: clean(body.constraints, 1000),
    intent: clean(body.intent), tone: clean(body.tone, 30), length: clean(body.length, 20),
  };
  if (!data.product || !data.intent) return NextResponse.json({ error: "请填写产品型号和生成要求" }, { status: 400 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, temperature: 0.55, max_tokens: 1200, messages: [
        { role: "system", content: `你是雷鸟品牌内部销售文案助手。文案用于团长群或达人群，结构应为：标题、一句话变化、产品/价格/政策、1至3个购买理由、限制与待确认、行动号召。只能使用用户提供的事实，不得虚构型号、参数、政策、价格、截止时间、库存、销量、排名或优惠。缺失信息必须写【待业务确认】；价格叠加关系不明确时不得计算确定到手价。若价格、政策、型号或参数相互冲突，风险状态必须是“不可发布”；存在重要缺失时为“修改后再审”；信息完整时为“可进入人工终审”。禁止使用无依据的“全网最低、最好、第一、售罄不补、马上涨价”等表述。输出必须包含三个区块：【文案草稿】【待确认事项】【风险状态】，最终内容仍需人工终审，禁止声称已自动发布。` },
        { role: "user", content: `请生成内部销售宣发文案。\n场景：${data.scene}\n目标群体：${data.audience}\n渠道：${data.channel}\n品类：${data.category}\n产品型号：${data.product}\n已确认卖点/参数：${data.facts || "未提供"}\n活动政策与价格依据：${data.policy || "未提供"}\n时间/地区/条件：${data.constraints || "未提供"}\n用户意图：${data.intent}\n风格：${data.tone}\n长度：${data.length}` },
      ] }),
    });
    const payload = await upstream.json().catch(() => ({})) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (!upstream.ok) return NextResponse.json({ error: payload.error?.message || "AI 服务暂时不可用" }, { status: 502 });
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) return NextResponse.json({ error: "AI 未返回有效文案，请重试" }, { status: 502 });
    return NextResponse.json({ content });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.name === "AbortError" ? "生成超时，请稍后重试" : "无法连接 AI 服务" }, { status: 502 });
  } finally { clearTimeout(timer); }
}
