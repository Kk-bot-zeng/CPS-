import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase/config";

export function GET() {
  return NextResponse.json({ ok: true, service: "雷鸟电视CPS系统", database: supabaseConfigured ? "configured" : "demo" });
}
