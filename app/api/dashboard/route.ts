import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { isChannel } from "@/lib/channels";

type OrderRow = {
  order_no: string; payable_amount: number; quantity: number; order_status: string;
  talent_name_raw: string; model_name: string | null; product_name_raw: string | null;
  paid_at: string | Date; is_talent: boolean;
};

function dateKey(value: string | Date | null | undefined) {
  if (!value) return "未知日期";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value).slice(0, 10) : parsed.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const channel = url.searchParams.get("channel") || "all";
  const talent = url.searchParams.get("talent") || "all";
  const model = url.searchParams.get("model") || "all";
  if (channel !== "all" && !isChannel(channel))
    return NextResponse.json({ error: "无效渠道" }, { status: 400 });

  let query = auth.admin.from("orders")
      .select("order_no,payable_amount,quantity,order_status,talent_name_raw,model_name,product_name_raw,paid_at,is_talent")
      .eq("is_talent", true).order("paid_at");
  if (start) query = query.gte("paid_at", `${start}T00:00:00`);
  if (end) query = query.lte("paid_at", `${end}T23:59:59`);
  if (channel !== "all") query = query.eq("platform", channel);
  if (talent !== "all") query = query.eq("talent_name_raw", talent);
  if (model !== "all") query = query.eq("model_name", model);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const all = (data || []) as OrderRow[];

  const talentMap = new Map<string, { gmv: number; gsv: number; orders: Set<string>; qty: number }>();
  const modelMap = new Map<string, { gmv: number; qty: number; talents: Set<string>; orders: Set<string> }>();
  const seriesMap = new Map<string, { gmv: number; qty: number; talents: Set<string>; orders: Set<string> }>();
  const dailyMap = new Map<string, { gmv: number; gsv: number; qty: number; orders: Set<string> }>();
  const crossMap = new Map<string, { talent: string; model: string; gmv: number; qty: number; orders: Set<string> }>();
  let gmv = 0, gsv = 0, quantity = 0;
  const orderSet = new Set<string>(), validOrderSet = new Set<string>();
  for (const o of all) {
    const amount = Number(o.payable_amount) || 0;
    const qty = Number(o.quantity) || 0;
    const valid = o.order_status !== "已关闭";
    const modelName = o.model_name || "型号未匹配";
    const day = dateKey(o.paid_at);
    gmv += amount; quantity += qty; orderSet.add(o.order_no);
    if (valid) { gsv += amount; validOrderSet.add(o.order_no); }
    const t = talentMap.get(o.talent_name_raw) || { gmv: 0, gsv: 0, orders: new Set(), qty: 0 };
    t.gmv += amount; t.gsv += valid ? amount : 0; t.orders.add(o.order_no); t.qty += qty;
    talentMap.set(o.talent_name_raw, t);
    const p = modelMap.get(modelName) || { gmv: 0, qty: 0, talents: new Set(), orders: new Set() };
    p.gmv += amount; p.qty += qty; p.talents.add(o.talent_name_raw); p.orders.add(o.order_no);
    modelMap.set(modelName, p);
    const seriesName = modelName.replace(/^\s*\d{2,3}(?:\.\d+)?\s*/, "").trim() || modelName;
    const s = seriesMap.get(seriesName) || { gmv: 0, qty: 0, talents: new Set(), orders: new Set() };
    s.gmv += amount; s.qty += qty; s.talents.add(o.talent_name_raw); s.orders.add(o.order_no);
    seriesMap.set(seriesName, s);
    const d = dailyMap.get(day) || { gmv: 0, gsv: 0, qty: 0, orders: new Set() };
    d.gmv += amount; d.gsv += valid ? amount : 0; d.qty += qty; d.orders.add(o.order_no);
    dailyMap.set(day, d);
    const key = `${o.talent_name_raw}\u0000${modelName}`;
    const c = crossMap.get(key) || { talent: o.talent_name_raw, model: modelName, gmv: 0, qty: 0, orders: new Set<string>() };
    c.gmv += amount; c.qty += qty; c.orders.add(o.order_no); crossMap.set(key, c);
  }
  const talents = [...talentMap].map(([name, v]) => ({ name, gmv: v.gmv, gsv: v.gsv, orders: v.orders.size, qty: v.qty }))
    .sort((a, b) => b.gmv - a.gmv);
  const products = [...modelMap].map(([name, v]) => ({ name, gmv: v.gmv, qty: v.qty, talents: v.talents.size, orders: v.orders.size }))
    .sort((a, b) => b.qty - a.qty);
  const seriesProducts = [...seriesMap].map(([name, v]) => ({ name, gmv: v.gmv, qty: v.qty, talents: v.talents.size, orders: v.orders.size }))
    .sort((a, b) => b.qty - a.qty);
  const daily = [...dailyMap].map(([date, v]) => ({ date, gmv: v.gmv, gsv: v.gsv, qty: v.qty, orders: v.orders.size }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return NextResponse.json({
    gmv, gsv, orders: orderSet.size, validOrders: validOrderSet.size, quantity,
    activeTalents: talentMap.size, talents, products, seriesProducts, daily,
    talentModels: [...crossMap.values()].map(({ orders, ...x }) => ({ ...x, orders: orders.size })).sort((a, b) => b.qty - a.qty),
  }, { headers: { "Cache-Control": "private, max-age=15" } });
}
