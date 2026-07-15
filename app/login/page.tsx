"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, Mail, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const { error } = await createClient().auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.replace("/"); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "登录失败"); }
    finally { setLoading(false); }
  }
  return <main className="login-page"><section className="login-brand"><div className="login-logo"><Zap size={30}/></div><p>THUNDERBIRD TV · CPS SYSTEM</p><h1>让达人合作<br/>更清晰、更高效</h1><span>销售数据、达人关系与区域资源的一体化运营平台</span></section><section className="login-card"><div><h2>欢迎回来</h2><p>登录雷鸟电视CPS系统</p><form onSubmit={submit}><label>邮箱</label><div className="login-input"><Mail size={17}/><input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.com" required/></div><label>密码</label><div className="login-input"><LockKeyhole size={17}/><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="请输入密码" required/></div>{error&&<div className="login-error">{error}</div>}<button disabled={loading}>{loading?"正在登录…":"登录系统"}</button></form><small>账号由系统管理员在 Supabase 后台创建</small></div></section></main>;
}
