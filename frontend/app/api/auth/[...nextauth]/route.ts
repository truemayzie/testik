// app/api/auth/[...nextauth]/route.ts
// Этот файл обрабатывает все запросы авторизации

import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
