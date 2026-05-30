"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { WORK_PAGES } from "@/lib/prices";
import { createOrderTask, savePendingGeneration } from "@/lib/createOrderTask";
import { loadPendingOrderDraft, consumePendingPreviewAfterAuth } from "@/lib/pendingOrderDraft";
import styles from "./order.module.css";

/** /order — создаёт черновик и редиректит на /order/[id] (старые ссылки с ?topic=). */
export default function OrderBootstrap() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const startedRef = useRef(false);

  useEffect(() => {
    if (status === "loading" || startedRef.current) return;

    if (status === "unauthenticated") {
      const q = searchParams.toString();
      router.replace(`/auth/signin?callbackUrl=${encodeURIComponent(q ? `/order?${q}` : "/order")}`);
      return;
    }

    startedRef.current = true;
    consumePendingPreviewAfterAuth();

    void (async () => {
      let topic = searchParams.get("topic")?.trim() ?? "";
      let workType = searchParams.get("workType")?.trim() ?? "";
      let pages = Number(searchParams.get("pages"));

      try {
        const fromStorage = loadPendingOrderDraft();
        if (fromStorage) {
          if (fromStorage.taskId) {
            router.replace(`/order/${fromStorage.taskId}`);
            return;
          }
          topic = fromStorage.topic?.trim() ?? topic;
          workType = fromStorage.workType?.trim() ?? workType;
          if (fromStorage.pages > 0) pages = fromStorage.pages;
        }
      } catch { /* ignore */ }

      if (!topic || !workType) {
        router.replace("/");
        return;
      }

      const range = WORK_PAGES[workType];
      if (!Number.isFinite(pages) || pages <= 0) {
        pages = range?.default ?? 20;
      }
      if (range) {
        pages = Math.min(range.max, Math.max(range.min, pages));
      }

      let extras: string[] = [];
      try {
        const ex = sessionStorage.getItem("pendingExtrasChoice");
        if (ex) extras = JSON.parse(ex) as string[];
      } catch { /* ignore */ }

      const created = await createOrderTask({ topic, workType, pages, extras });
      if ("error" in created) {
        router.replace("/");
        return;
      }

      savePendingGeneration({ taskId: created.id, topic, workType, pages });
      router.replace(`/order/${created.id}`);
    })();
  }, [status, searchParams, router]);

  return (
    <div className={styles.loading}>
      <div className={styles.spinner} aria-hidden />
      <p>Готовим заказ…</p>
    </div>
  );
}
