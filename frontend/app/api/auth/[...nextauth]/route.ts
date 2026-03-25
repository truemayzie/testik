// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { setDeviceId } from "@/lib/vk-device-store";
import { NextRequest } from "next/server";

const handler = NextAuth(authOptions);

async function authHandler(req: NextRequest, ctx: { params: { nextauth: string[] } }) {
  const { pathname, searchParams } = new URL(req.url);
  if (pathname.includes("/callback/vk")) {
    const deviceId = searchParams.get("device_id");
    const state    = searchParams.get("state");
    if (deviceId && state) setDeviceId(state, deviceId);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return handler(req as any, ctx as any);
}

export { authHandler as GET, authHandler as POST };
