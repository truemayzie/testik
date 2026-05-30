"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import PaymentWidget from "@/app/components/PaymentWidget";
import OrderGenerationAside from "./OrderGenerationAside";
import OrderDoneView from "./OrderDoneView";
import { savePendingGeneration } from "@/lib/createOrderTask";
import { clearPaymentPreviewClientCaches } from "@/lib/paymentPreviewClient";
import {
  loadOrderGenSession,
  patchOrderGenSession,
  saveOrderGenSession,
  type OrderGenPhase,
} from "@/lib/orderGenerationSession";
import { loadPendingOrderDraft } from "@/lib/pendingOrderDraft";
import styles from "./order.module.css";

type OrderState = {
  taskId: string;
  topic: string;
  workType: string;
  extras: string[];
  pages: number;
};

type Phase = "checkout" | "generating" | "done";

function initialPhase(taskId: string): Phase {
  const saved = loadOrderGenSession(taskId);
  if (saved?.phase === "done") return "done";
  if (saved?.phase === "generating") return "generating";
  return "checkout";
}

function isGeneratingPhase(taskId: string): boolean {
  return loadOrderGenSession(taskId)?.phase === "generating";
}

async function hydrateOrderFromGeneration(taskId: string): Promise<{
  order: OrderState;
  generationId: string;
  phase: OrderGenPhase;
} | null> {
  try {
    const res = await fetch(`/api/generations/by-task/${encodeURIComponent(taskId)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const gen = (await res.json()) as {
      id: string;
      topic: string;
      workType: string;
      pages: number;
      status: string;
      extras?: string | null;
    };
    if (!gen?.id) return null;

    const sessionExtras = loadOrderGenSession(taskId)?.extras ?? [];

    const phase: "generating" | "done" =
      gen.status === "completed" ? "done" : "generating";
    const order: OrderState = {
      taskId,
      topic: gen.topic,
      workType: gen.workType,
      pages: gen.pages,
      extras: sessionExtras,
    };
    saveOrderGenSession({
      ...order,
      phase,
      generationId: gen.id,
      startedAt: loadOrderGenSession(taskId)?.startedAt ?? Date.now(),
    });
    return { order, generationId: gen.id, phase };
  } catch {
    return null;
  }
}

function orderFromSession(taskId: string): OrderState | null {
  const saved = loadOrderGenSession(taskId);
  if (!saved) return null;
  return {
    taskId: saved.taskId,
    topic: saved.topic,
    workType: saved.workType,
    pages: saved.pages,
    extras: saved.extras,
  };
}

function phaseFromHydrate(phase: OrderGenPhase): Phase {
  if (phase === "done") return "done";
  if (phase === "generating") return "generating";
  return "checkout";
}

export default function OrderPageClient({ taskId }: { taskId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const [order, setOrder] = useState<OrderState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [phase, setPhase] = useState<Phase>(() => initialPhase(taskId));
  const autoGenerateHandled = useRef(false);

  const beginGeneration = useCallback(
    (extras?: string[]) => {
      if (!order) return;
      sessionStorage.removeItem("paymentWidgetRestore");
      clearPaymentPreviewClientCaches();
      savePendingGeneration({
        taskId: order.taskId,
        topic: order.topic,
        workType: order.workType,
        pages: order.pages,
      });
      const chosenExtras = extras?.length ? extras : order.extras;
      if (chosenExtras.length) {
        try {
          sessionStorage.setItem("pendingExtrasChoice", JSON.stringify(chosenExtras));
        } catch {
          /* ignore */
        }
      }
      saveOrderGenSession({
        taskId: order.taskId,
        topic: order.topic,
        workType: order.workType,
        pages: order.pages,
        extras: chosenExtras,
        phase: "generating",
      });
      void fetch(`/api/tasks/${encodeURIComponent(order.taskId)}`, { method: "DELETE" }).catch(
        () => {},
      );
      window.history.replaceState({}, "", `/order/${order.taskId}`);
      setPhase("generating");
    },
    [order],
  );

  const handleGenerationComplete = useCallback(() => {
    patchOrderGenSession(taskId, { phase: "done" });
    void fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" }).catch(() => {});
    setPhase("done");
  }, [taskId]);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.replace(`/auth/signin?callbackUrl=${encodeURIComponent(`/order/${taskId}`)}`);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const fromSession = orderFromSession(taskId);
          const draft = loadPendingOrderDraft();
          const fromGen = await hydrateOrderFromGeneration(taskId);
          if (fromGen && !cancelled) {
            setOrder(fromGen.order);
            setPhase(phaseFromHydrate(fromGen.phase));
            return;
          }
          if (fromSession) {
            if (!cancelled) {
              setOrder(fromSession);
              setPhase(initialPhase(taskId));
            }
            return;
          }
          if (draft?.taskId === taskId && draft.topic && draft.workType) {
            if (!cancelled) {
              setOrder({
                taskId,
                topic: draft.topic,
                workType: draft.workType,
                pages: draft.pages || 20,
                extras: loadOrderGenSession(taskId)?.extras ?? [],
              });
              setPhase(initialPhase(taskId));
            }
            return;
          }
          if (!cancelled) {
            setLoadError(
              typeof data.error === "string" ? data.error : "Заказ не найден или истёк",
            );
          }
          return;
        }

        const extras = Array.isArray(data.extras)
          ? data.extras.filter((x: unknown): x is string => typeof x === "string")
          : [];
        const next: OrderState = {
          taskId: data.id,
          topic: String(data.topic ?? ""),
          workType: String(data.workType ?? "Реферат"),
          pages: Number(data.pages) || 20,
          extras,
        };
        savePendingGeneration({
          taskId: next.taskId,
          topic: next.topic,
          workType: next.workType,
          pages: next.pages,
        });
        if (!cancelled) {
          setOrder(next);
          if (isGeneratingPhase(taskId)) {
            setPhase("generating");
          } else {
            const fromGen = await hydrateOrderFromGeneration(taskId);
            if (fromGen) {
              setPhase(phaseFromHydrate(fromGen.phase));
            } else {
              setPhase(initialPhase(taskId));
            }
          }
        }
      } catch {
        const fromSession = orderFromSession(taskId);
        const fromGen = await hydrateOrderFromGeneration(taskId);
        if (fromGen && !cancelled) {
          setOrder(fromGen.order);
          setPhase(phaseFromHydrate(fromGen.phase));
          return;
        }
        if (fromSession && !cancelled) {
          setOrder(fromSession);
          setPhase(initialPhase(taskId));
          return;
        }
        if (!cancelled) setLoadError("Не удалось загрузить заказ");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, taskId, router]);

  useEffect(() => {
    if (!order || phase !== "checkout") return;
    if (searchParams.get("autoGenerate") !== "1") return;
    if (autoGenerateHandled.current) return;
    autoGenerateHandled.current = true;
    beginGeneration();
  }, [order, phase, searchParams, beginGeneration]);

  if (status === "loading" || (!order && !loadError)) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} aria-hidden />
        <p>Загрузка заказа…</p>
      </div>
    );
  }

  if (loadError || !order) {
    return (
      <div className={styles.loading}>
        <p>{loadError || "Заказ не найден"}</p>
        <button type="button" className={styles.backBtn} onClick={() => router.push("/dashboard")}>
          Мои работы
        </button>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className={styles.shell}>
        <OrderDoneView order={order} />
      </div>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const resumeSession =
    phase === "generating" ? loadOrderGenSession(taskId) : null;

  return (
    <div className={styles.shell}>
      <PaymentWidget
        taskId={order.taskId}
        workType={order.workType}
        extras={order.extras}
        topic={order.topic}
        returnUrl={`${origin}/payment/success`}
        onSuccess={(ctx) => beginGeneration(ctx?.extras)}
        asideSlot={
          phase === "generating" ? (
            <OrderGenerationAside
              topic={order.topic}
              workType={order.workType}
              pages={order.pages}
              extrasItems={order.extras}
              taskId={order.taskId}
              resumeSession={resumeSession}
              onComplete={handleGenerationComplete}
            />
          ) : undefined
        }
      />
    </div>
  );
}
