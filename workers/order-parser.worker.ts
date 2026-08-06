import * as XLSX from "xlsx";

self.onmessage = async (
  event: MessageEvent<{ buffer: ArrayBuffer; preferredSheets?: string[]; mode?: "rows" | "orders" }>,
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
      raw: false,
      dateNF: "yyyy-mm-dd hh:mm:ss",
      defval: "",
    });
    if (event.data.mode === "orders") {
      const num = (value: unknown) => Number(String(value ?? 0).replace(/,/g, ""));
      const orders = rows.map((row, index) => {
        const orderNo = String(row["主订单编号"] ?? "").trim();
        const productId = String(row["商品ID"] ?? "").trim();
        const merchantCode = String(row["商家编码"] ?? "").trim();
        const paidAt = String(row["支付完成时间"] ?? "").trim();
        return {
          sourceKey: `${orderNo}|${productId}|${merchantCode}|${paidAt}|${index + 2}`,
          orderNo,
          productId,
          merchantCode,
          qty: num(row["商品数量"]),
          paidAt,
          status: String(row["订单状态"] ?? ""),
          amount: num(row["订单应付金额"]),
          talent: String(row["达人昵称"] ?? "").trim(),
          product: String(row["选购商品"] ?? ""),
          model: String(row["型号"] ?? ""),
        };
      }).filter((row) => row.orderNo && row.paidAt && row.qty > 0);
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
