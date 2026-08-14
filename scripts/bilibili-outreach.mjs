import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const protocolArg = args.find((value) => value.startsWith("cps-bilibili://"));
const sendMode = Boolean(protocolArg) || args.includes("--send");
const fileArg = args.find((value) => value.endsWith(".json"));
const downloads = path.join(os.homedir(), "Downloads");
const taskFile = protocolArg ? "" : fileArg || fs.readdirSync(downloads)
  .filter((name) => /^bilibili-outreach-\d+\.json$/.test(name))
  .map((name) => path.join(downloads, name))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
if (!protocolArg && !taskFile) throw new Error("未找到建联任务文件，请先在系统中点击一键建联生成任务。");

const payload = protocolArg
  ? (() => {
      const url = new URL(protocolArg);
      const encoded = url.searchParams.get("payload") || "";
      const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
    })()
  : JSON.parse(fs.readFileSync(taskFile, "utf8"));
const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
if (!tasks.length) throw new Error("任务文件没有达人数据。");
const profile = path.join(os.homedir(), ".cps-bilibili-profile");
const context = await chromium.launchPersistentContext(profile, { headless: false, viewport: null, slowMo: 180 });
const page = context.pages()[0] || await context.newPage();
await page.goto("https://message.bilibili.com/", { waitUntil: "domcontentloaded" });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log(`任务来源：${protocolArg ? "系统一键建联" : taskFile}\n达人数量：${tasks.length}\n模式：${sendMode ? "发送" : "仅预览"}`);
console.log("请在打开的B站窗口确认已登录。脚本默认限速，每次发送间隔8-15秒，并保存回执。");
if (sendMode && !protocolArg) {
  const answer = await rl.question("确认话术与达人后，输入 SEND 才会开始实际发送：");
  if (answer.trim() !== "SEND") { await context.close(); rl.close(); process.exit(0); }
}

const results = [];
for (const [index, task] of tasks.entries()) {
  const uid = String(task.creator_uid || "").trim();
  const message = String(task.message || "").trim();
  const result = { ...task, status: "previewed", processed_at: new Date().toISOString() };
  try {
    if (!uid || !message) throw new Error("缺少UID或话术");
    await page.goto(`https://message.bilibili.com/#/whisper/mid${uid}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1800);
    console.log(`[${index + 1}/${tasks.length}] ${task.creator_name} (${uid})\n${message}`);
    if (sendMode) {
      // Bilibili currently renders the composer as a focusable div rather than
      // a textarea/contenteditable element, so fill() is not compatible.
      const editor = page.locator(".msb-textarea, [class*='MessageSendBox__Textarea']").last();
      await editor.waitFor({ state: "visible", timeout: 12000 });
      await editor.click();
      await page.keyboard.press("Control+A");
      await page.keyboard.insertText(message);
      const send = page.getByText("发送", { exact: true }).last();
      await send.click();
      await page.getByText(message, { exact: true }).last().waitFor({ state: "visible", timeout: 12000 });
      result.status = "sent";
      await page.waitForTimeout(8000 + Math.floor(Math.random() * 7000));
    }
  } catch (error) {
    result.status = "failed";
    result.error = error instanceof Error ? error.message : String(error);
  }
  results.push(result);
}
const receipt = path.join(protocolArg ? downloads : path.dirname(taskFile), `bilibili-outreach-receipt-${Date.now()}.json`);
fs.writeFileSync(receipt, JSON.stringify({ task_file: taskFile, send_mode: sendMode, results }, null, 2));
console.log(`处理完成，回执：${receipt}`);
if (!protocolArg) await rl.question("按回车关闭浏览器...");
rl.close();
await context.close();
