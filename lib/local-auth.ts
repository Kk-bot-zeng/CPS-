import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE = "cps_session";
const secret = () => process.env.SESSION_SECRET || "";
export function signSession(user: { id: string; email: string }) {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 7 * 86400000 })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
export function verifySession(token?: string) {
  try { if (!token || !secret()) return null; const [payload, sig] = token.split("."); const expected = createHmac("sha256", secret()).update(payload).digest("base64url"); if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null; const user = JSON.parse(Buffer.from(payload, "base64url").toString()); return user.exp > Date.now() ? user as {id:string;email:string;exp:number} : null; } catch { return null; }
}
export async function currentUser() { return verifySession((await cookies()).get(COOKIE)?.value); }
export const sessionCookie = COOKIE;
