import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";

const collectorUrl = process.env.JD_COLLECTOR_URL || "http://127.0.0.1:3210";

async function collector(path: string, init?: RequestInit) {
  const response = await fetch(`${collectorUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(process.env.JD_COLLECTOR_TOKEN
        ? { "X-Collector-Token": process.env.JD_COLLECTOR_TOKEN }
        : {}),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({ error: "采集服务返回异常" }));
  if (!response.ok) throw new Error(result.error || "京东采集服务不可用");
  return result;
}

export async function GET() {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  try {
    return NextResponse.json(await collector("/status"));
  } catch (error) {
    return NextResponse.json({
      ready: false,
      status: "unavailable",
      message: error instanceof Error ? error.message : "京东采集服务不可用",
    });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const action = body.action === "prepare" ? "prepare" : "start";
  try {
    return NextResponse.json(await collector(`/${action}`, {
      method: "POST",
      body: JSON.stringify({
        startDate: body.startDate,
        endDate: body.endDate,
        requestedBy: auth.user.id,
      }),
    }));
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "京东采集服务不可用",
    }, { status: 503 });
  }
}
