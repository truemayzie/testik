import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/api/slots`, { cache: "no-store" });
    if (!res.ok) throw new Error(`backend ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    // При недоступности бэкенда возвращаем «всё доступно»
    return NextResponse.json({ used: 0, max: 8, available: ["Сочинение", "Эссе", "Доклад", "Реферат", "Курсовая", "ВКР"] });
  }
}
