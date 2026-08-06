type ParseOptions = {
  preferredSheets?: string[];
  timeoutMs?: number;
  mode?: "rows" | "orders";
};

export async function parseSpreadsheet<T = Record<string, unknown>>(
  file: File,
  options: ParseOptions = {},
): Promise<T[]> {
  const buffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/order-parser.worker.ts", import.meta.url),
    );
    const timer = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("文件解析超时，请检查文件是否损坏或拆分后重试"));
    }, options.timeoutMs ?? 180_000);
    const finish = () => {
      window.clearTimeout(timer);
      worker.terminate();
    };
    worker.onmessage = (event) => {
      finish();
      event.data?.ok
        ? resolve(event.data.rows as T[])
        : reject(new Error(event.data?.error || "文件解析失败"));
    };
    worker.onerror = () => {
      finish();
      reject(new Error("文件解析线程异常，请重新选择文件"));
    };
    worker.postMessage(
      { buffer, preferredSheets: options.preferredSheets || [], mode: options.mode || "rows" },
      [buffer],
    );
  });
}
