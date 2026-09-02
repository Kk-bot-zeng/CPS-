"use client";

import { useEffect, useState } from "react";
import { CircleAlert, LoaderCircle, Play, RefreshCw, ShieldCheck } from "lucide-react";

type SyncState = {
  ready?: boolean;
  status?: string;
  message?: string;
  lastRun?: string;
};

export default function JdSyncCard() {
  const [state, setState] = useState<SyncState>({ status: "loading" });
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    if (loading || running) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/jd-sync", { cache: "no-store" });
      const payload = await response.json().catch(() => null) as SyncState | null;
      if (!response.ok) throw new Error(payload?.message || `采集服务返回 HTTP ${response.status}`);
      setState(payload || { ready: false, status: "unavailable", message: "采集服务返回空状态" });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "暂时无法连接采集服务";
      setError(message);
      setState((current) => ({ ...current, ready: false, status: "unavailable", message }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const run = async (action: "prepare" | "start") => {
    if (running || loading) return;
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/jd-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => null) as SyncState | null;
      if (!response.ok) throw new Error(payload?.message || `京东同步返回 HTTP ${response.status}`);
      setState(payload || { ready: false, status: "unavailable", message: "同步服务返回空状态" });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "京东同步失败，请稍后重试";
      setError(message);
      setState((current) => ({ ...current, status: "error", message }));
    } finally {
      setRunning(false);
      window.setTimeout(() => void load(), 1200);
    }
  };

  const available = state.ready && state.status !== "running";
  return (
    <section className="jd-sync-card">
      <div className="jd-sync-icon"><ShieldCheck size={22} /></div>
      <div className="jd-sync-copy">
        <b>京东联盟自动取数</b>
        <span>{state.message || "首次完成京东验证后，系统将复用登录状态自动下载并导入订单。"}</span>
        {error && <small role="alert">{error}</small>}
        {state.lastRun && <small>最近任务：{state.lastRun}</small>}
      </div>
      <div className="jd-sync-actions">
        <button type="button" onClick={load} disabled={loading || running} aria-label="刷新京东采集状态"><RefreshCw size={15} /></button>
        {!state.ready && (
          <button type="button" className="secondary" disabled={running} onClick={() => run("prepare")}>
            {running ? <LoaderCircle className="spin" size={15} /> : <CircleAlert size={15} />} 初始化验证
          </button>
        )}
        <button type="button" className="primary" disabled={!available || running} onClick={() => run("start")}>
          {running || state.status === "running" ? <LoaderCircle className="spin" size={15} /> : <Play size={15} />} 一键同步京东数据
        </button>
      </div>
    </section>
  );
}
