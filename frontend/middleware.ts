import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const res = NextResponse.next();

  // HTML-документы: не отдавать из кэша CDN/браузера со старыми ссылками на chunks после деплоя.
  if (
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/api") &&
    !/\.[a-zA-Z0-9]{1,8}$/.test(pathname.split("/").filter(Boolean).pop() ?? "")
  ) {
    res.headers.set(
      "Cache-Control",
      "private, no-cache, no-store, must-revalidate",
    );
  }

  if (pathname.startsWith("/admin")) {
    const sessionToken =
      request.cookies.get("next-auth.session-token")?.value ||
      request.cookies.get("__Secure-next-auth.session-token")?.value;

    if (!sessionToken) {
      return NextResponse.redirect(new URL("/auth/signin", request.url));
    }
  }

  return res;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/((?!_next/static|_next/image|_next/data|api/|favicon.ico|.*\\..*).*)",
  ],
};
