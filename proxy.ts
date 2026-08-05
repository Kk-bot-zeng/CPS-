import { NextResponse, type NextRequest } from "next/server";
async function valid(token: string | undefined) {
  try {
    if (!token || !process.env.SESSION_SECRET) return false;
    const [payload, signature] = token.split(".");
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(process.env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const normalize = (s: string) => s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
    const sig = Uint8Array.from(atob(normalize(signature)), c => c.charCodeAt(0));
    if (!(await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(payload)))) return false;
    const body = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(normalize(payload)), c => c.charCodeAt(0))));
    return body.exp > Date.now();
  } catch { return false; }
}
export async function proxy(request: NextRequest) {
  const loggedIn = await valid(request.cookies.get("cps_session")?.value);
  const isAuth = request.nextUrl.pathname.startsWith("/login") || request.nextUrl.pathname.startsWith("/api/auth");
  const isPublic = request.nextUrl.pathname === "/api/health";
  if (!loggedIn && !isAuth && !isPublic) return NextResponse.redirect(new URL("/login", request.url));
  if (loggedIn && request.nextUrl.pathname === "/login") return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|icon.svg|brand/).*)"] };
