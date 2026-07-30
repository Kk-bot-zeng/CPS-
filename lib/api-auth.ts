import { NextResponse } from "next/server";
import { currentUser } from "@/lib/local-auth";
import { localAdmin } from "@/lib/db";

export async function requireApiUser() {
  const user = await currentUser();
  if (!user) return { error: NextResponse.json({ error: "请先登录" }, { status: 401 }) };
  return { user, admin: localAdmin };
}
