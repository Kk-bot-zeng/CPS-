import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(items) {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthPage = request.nextUrl.pathname.startsWith("/login") || request.nextUrl.pathname.startsWith("/auth");
  const isPublicApi = request.nextUrl.pathname === "/api/health";
  if (!user && !isAuthPage && !isPublicApi) return NextResponse.redirect(new URL("/login", request.url));
  if (user && request.nextUrl.pathname === "/login") return NextResponse.redirect(new URL("/", request.url));
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|icon.svg).*)"] };
