import { requireApiUser } from "@/lib/api-auth";
import { isChannel } from "@/lib/channels";
import * as XLSX from "xlsx";

export async function GET(request: Request) {
  const auth = await requireApiUser(); if (auth.error) return auth.error;
  const url = new URL(request.url), start = url.searchParams.get("start"), end = url.searchParams.get("end");
  const channel = url.searchParams.get("channel") || "all";
  // Support repeated params from the multi-select control and legacy CSV URLs.
  const talentFilters = [...new Set(url.searchParams.getAll("talent")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value && value !== "all"))];
  const modelFilters = [...new Set(url.searchParams.getAll("model")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value && value !== "all"))];
  const category = url.searchParams.get("category") || "tv";
  if (channel !== "all" && !isChannel(channel)) return new Response("Invalid channel", { status: 400 });
  if (category !== "tv" && category !== "monitor") return new Response("Invalid category", { status: 400 });
  let q = auth.admin.from("orders").select("platform,order_no,paid_at,talent_name_raw,model_name,external_product_id,product_name_raw,quantity,payable_amount,order_status").eq("is_talent", true).eq("product_category", category).order("paid_at");
  if (start) q = q.gte("paid_at", `${start}T00:00:00`); if (end) q = q.lte("paid_at", `${end}T23:59:59`);
  if (channel !== "all") q = q.eq("platform", channel); if (talentFilters.length) q = q.in("talent_name_raw", talentFilters);
  const { data, error } = await q; if (error) return new Response(error.message, { status: 400 });
  const seriesOf = (name: string) => name.replace(/^\s*\d{2,3}(?:\.\d+)?\s*/, "").replace(/\s+/g, "").replace(/(Plus|Ultra|Pro)/i, " $1").trim() || name;
  const rows = (data || [])
    .filter((x: any) => !modelFilters.length || modelFilters.includes(seriesOf(x.model_name || "型号未匹配")))
    .map((x: any) => ({ "渠道":x.platform,"日期":String(x.paid_at).slice(0,10),"团长/达人":x.talent_name_raw,"推广名/型号":x.model_name||"","SKU":x.external_product_id||"","商品名称":x.product_name_raw||"","销售台数":Number(x.quantity)||0,"销售金额":Number(x.payable_amount)||0,"订单状态":x.order_status,"订单号":x.order_no }));
  const sheet = XLSX.utils.json_to_sheet(rows); sheet["!cols"] = [10,13,20,20,16,42,12,15,13,22].map(wch => ({ wch }));
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "筛选订单明细");
  const bytes = XLSX.write(book, { type:"array", bookType:"xlsx" });
  return new Response(bytes, { headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(`CPS销售数据_${start||"全部"}_${end||"全部"}.xlsx`)}`} });
}
