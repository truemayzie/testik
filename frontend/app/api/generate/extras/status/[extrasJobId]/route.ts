import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET(
  _request: NextRequest,
  { params }: { params: { extrasJobId: string } },
) {
  try {
    const res = await fetch(
      `${BACKEND_URL}/api/generate/extras/status/${params.extrasJobId}`,
      { signal: AbortSignal.timeout(10_000), cache: "no-store" },
    );
    if (!res.ok) return NextResponse.json({ status: "error", ready: [] });
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch {
    return NextResponse.json({ status: "error", ready: [] });
  }
}
