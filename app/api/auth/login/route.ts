import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { sessionCookie, signSession } from "@/lib/local-auth";

export async function POST(request: Request) {
  const { email, password } = await request.json();
  const result = await sql<{id:string;email:string;password_hash:string}>("select id,email,password_hash from app_users where lower(email)=lower($1) and active=true", [String(email || "")]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(String(password || ""), user.password_hash)))
    return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie, signSession({ id: user.id, email: user.email }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 604800, path: "/" });
  return response;
}
