import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PROFILE_FIELDS = [
  "university", "faculty", "department", "speciality",
  "course", "groupNumber", "fullName", "teacherName", "city",
] as const;

type ProfileField = typeof PROFILE_FIELDS[number];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true, name: true, email: true, image: true,
      university: true, faculty: true, department: true, speciality: true,
      course: true, groupNumber: true, fullName: true, teacherName: true, city: true,
    },
  });

  if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

  return NextResponse.json(user);
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  const body = await request.json();

  // Только разрешённые поля, макс 200 символов
  const data: Partial<Record<ProfileField, string | null>> = {};
  for (const field of PROFILE_FIELDS) {
    if (field in body) {
      const val = body[field];
      if (val === null || val === "") {
        data[field] = null;
      } else if (typeof val === "string") {
        data[field] = val.slice(0, 200);
      }
    }
  }

  const user = await prisma.user.update({
    where: { email: session.user.email },
    data,
    select: {
      id: true, name: true, email: true, image: true,
      university: true, faculty: true, department: true, speciality: true,
      course: true, groupNumber: true, fullName: true, teacherName: true, city: true,
    },
  });

  return NextResponse.json(user);
}
