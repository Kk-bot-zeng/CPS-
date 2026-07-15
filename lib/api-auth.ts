import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function requireApiUser() {
  const client = await createClient();
  const admin = createAdminClient();
  if (!client || !admin) return { error: NextResponse.json({ error: "数据库后台密钥尚未配置" }, { status: 503 }) };
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "请先登录" }, { status: 401 }) };
  return { user, admin };
}
