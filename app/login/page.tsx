"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, UserRound, Zap } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: account, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "登录失败");
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand">
        <div className="login-logo"><Zap size={30} /></div>
        <p>THUNDERBIRD TV · CPS SYSTEM</p>
        <h1>让达人合作<br />更清晰、更高效</h1>
        <span>销售数据、达人关系与区域资源的一体化运营平台</span>
      </section>
      <section className="login-card">
        <div>
          <h2>欢迎回来</h2>
          <p>登录雷鸟电视CPS系统</p>
          <form onSubmit={submit}>
            <label>账号</label>
            <div className="login-input">
              <UserRound size={17} />
              <input
                type="text"
                autoComplete="username"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="请输入账号"
                required
              />
            </div>
            <label>密码</label>
            <div className="login-input">
              <LockKeyhole size={17} />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                required
              />
            </div>
            {error && <div className="login-error">{error}</div>}
            <button disabled={loading}>{loading ? "正在登录…" : "登录系统"}</button>
          </form>
          <small>请输入管理员账号和密码登录</small>
        </div>
      </section>
    </main>
  );
}
