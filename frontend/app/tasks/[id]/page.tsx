"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/** Старый /tasks/[id] → /order/[id] */
export default function TaskRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  useEffect(() => {
    if (id) router.replace(`/order/${id}`);
    else router.replace("/dashboard");
  }, [router, id]);

  return null;
}
