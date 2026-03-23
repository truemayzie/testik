import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { action: "ban" | "unban" | "makeAdmin" | "removeAdmin" };

  if (params.id === admin.id && (body.action === "ban" || body.action === "removeAdmin")) {
    return NextResponse.json({ error: "Нельзя изменить свои права" }, { status: 400 });
  }

  let update: { banned?: boolean; role?: string } = {};
  if (body.action === "ban")         update = { banned: true };
  else if (body.action === "unban")  update = { banned: false };
  else if (body.action === "makeAdmin")   update = { role: "admin" };
  else if (body.action === "removeAdmin") update = { role: "user" };
  else return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const user = await prisma.user.update({
    where: { id: params.id },
    data: update,
    select: { id: true, role: true, banned: true },
  });

  return NextResponse.json(user);
}
