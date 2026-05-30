"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Старый URL — редирект на /order (создаст черновик). */
export default function TaskPendingRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/order");
  }, [router]);

  return null;
}
