import * as XLSX from "xlsx";

self.onmessage = async (
  event: MessageEvent<{ buffer: ArrayBuffer; preferredSheets?: string[]; mode?: "rows" | "orders"; channel?: string }>,
) => {
  try {
    const wb = XLSX.read(event.data.buffer, {
      type: "array",
      cellDates: true,
      cellStyles: false,
      cellHTML: false,
      cellFormula: false,
      cellNF: false,
      dense: true,
    });
    const name = (event.data.preferredSheets || []).find((sheet) =>
      wb.SheetNames.includes(sheet),
    ) || wb.SheetNames[0];
    if (!name) throw new Error("文件中没有可读取的工作表");
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], {
      raw: true,
      dateNF: "yyyy-mm-dd hh:mm:ss",
      defval: "",
    });
    if (event.data.mode === "orders") {
      const num = (value: unknown) => Number(String(value ?? 0).replace(/,/g, ""));
      const identifier = (value: unknown) => {
        const text = String(value ?? "").trim().replace(/^\t+|\t+$/g, "");
        if (!/^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(text)) return text;
        const [coefficient, exponentText] = text.toLowerCase().split("e");
        const exponent = Number(exponentText);
        const negative = coefficient.startsWith("-");
        const digits = coefficient.replace(/^[+-]/, "").replace(".", "");
        const decimalPlaces = (coefficient.split(".")[1] || "").length;
        const zeros = exponent - decimalPlaces;
        return `${negative ? "-" : ""}${zeros >= 0 ? digits + "0".repeat(zeros) : `${digits.slice(0, digits.length + zeros)}.${digits.slice(digits.length + zeros)}`}`;
      };
      const orders = rows.map((row, index) => {
        const jd = event.data.channel === "jd";
        const orderNo = identifier(jd ? (row["订单编号"] ?? row["订单号"] ?? "") : (row["主订单编号"] ?? ""));
        const productId = identifier(jd ? (row["商品编号"] ?? row["SKU"] ?? row["SKU ID"] ?? "") : (row["商品ID"] ?? ""));
        const merchantCode = identifier(jd ? (row["商品编号"] ?? row["SKU"] ?? row["SKU ID"] ?? "") : (row["商家编码"] ?? ""));
        const paidAt = String(jd ? (row["下单日期"] ?? row["下单时间"] ?? row["订单时间"] ?? "") : (row["支付完成时间"] ?? "")).trim();
        const qty = num(jd ? (row["商品数量"] ?? row["数量"] ?? 1) : row["商品数量"]);
        const amount = num(jd ? (row["计佣金额"] ?? row["实际支付金额"] ?? row["订单金额"] ?? 0) : row["订单应付金额"]);
        const valid = String(row["是否有效"] ?? "").trim();
        return {
          sourceKey: `${orderNo}|${productId}|${merchantCode}|${paidAt}|${index + 2}`,
          orderNo,
          productId,
          merchantCode,
          qty,
          paidAt,
          status: jd ? (valid === "有效" ? "已成交" : String(row["订单状态"] ?? valid)) : String(row["订单状态"] ?? ""),
          amount,
          talent: String(jd ? (row["推客pin"] ?? row["推客PIN"] ?? row["团长名称"] ?? "") : (row["达人昵称"] ?? "")).trim(),
          product: String(jd ? (row["SKU名称"] ?? row["商品名称"] ?? "") : (row["选购商品"] ?? "")),
          model: String(jd ? (row["推广名"] ?? row["型号"] ?? "") : (row["型号"] ?? "")).trim(),
          plan: String(jd ? (row["所属计划/活动"] ?? row["计划名称"] ?? "") : "").trim(),
          valid,
        };
      }).filter((row) => row.orderNo && row.paidAt && row.qty > 0 && (event.data.channel !== "jd" || !row.valid || row.valid === "有效"));
      self.postMessage({ ok: true, rows: orders });
    } else {
      self.postMessage({ ok: true, rows });
    }
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "Excel 文件解析失败",
    });
  }
};
