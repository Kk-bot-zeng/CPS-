import * as XLSX from "xlsx";

self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    const wb = XLSX.read(event.data, { type: "array", cellDates: true });
    const name = wb.SheetNames.includes("总表")
      ? "总表"
      : wb.SheetNames.includes("gmv")
        ? "gmv"
        : wb.SheetNames[0];
    if (!name) throw new Error("文件中没有可读取的工作表");
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], {
      raw: false,
      dateNF: "yyyy-mm-dd hh:mm:ss",
      defval: "",
    });
    self.postMessage({ ok: true, rows });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "Excel 文件解析失败",
    });
  }
};

