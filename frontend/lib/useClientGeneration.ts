"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { computeProgressFromSteps, getProgressSteps, type Step } from "@/app/lib/progressSteps";
import { trackWorkActivityClient } from "@/app/lib/trackWorkActivity";

export type ReferatResult = {
  title: string;
  structure: string[];
  content: Record<string, string>;
  sources: string[];
  meta: Record<string, string | number>;
  profile?: Record<string, unknown>;
};

type BackendProgress = {
  step?: number;
  total_steps?: number;
  label?: string;
  percent?: number;
  eta_seconds?: number | null;
};

const GENERATE_MAX_WAIT_MS = 25 * 60 * 1000;
const GENERATE_POLL_MS = 2_500;

export function formatEta(sec: number | null): string {
  if (sec == null) return "";
  if (sec <= 0) return "меньше минуты";
  const min = Math.ceil(sec / 60);
  if (min < 60) return `~${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `~${h} ч` : `~${h} ч ${m} мин`;
}

export function useClientGeneration() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReferatResult | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [generationSlug, setGenerationSlug] = useState<string | null>(null);
  const [workType, setWorkType] = useState("");
  const [topic, setTopic] = useState("");

  const [stepIndex, setStepIndex] = useState(0);
  const [totalProgress, setTotalProgress] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [backendStageLabel, setBackendStageLabel] = useState("");
  const [dots, setDots] = useState(".");

  const [extrasGenerating, setExtrasGenerating] = useState(false);
  const [extrasReady, setExtrasReady] = useState<string[]>([]);
  const [extrasError, setExtrasError] = useState<string | null>(null);
  const [extrasJobId, setExtrasJobId] = useState<string | null>(null);
  const [presentationJobId, setPresentationJobId] = useState<string | null>(null);
  const [speechJobId, setSpeechJobId] = useState<string | null>(null);
  const [extrasProgress, setExtrasProgress] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepsRef = useRef<Step[]>([]);
  const startedAtRef = useRef(0);
  const backendLabelRef = useRef("");
  const generationIdRef = useRef<string | null>(null);
  const extrasProgressRef = useRef(0);
  const extrasGenIdRef = useRef<string | null>(null);
  const currentProgressRef = useRef(0);
  const targetProgressRef = useRef(0);

  const stopProgress = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    currentProgressRef.current = 100;
    targetProgressRef.current = 100;
    setTotalProgress(100);
    setStepIndex(stepsRef.current.length > 0 ? stepsRef.current.length - 1 : 0);
    setEtaSeconds(0);
  }, []);

  const tickSmoothProgress = useCallback(() => {
    if (!startedAtRef.current) return;
    const cur = currentProgressRef.current;
    const target = targetProgressRef.current;

    let next = cur;
    if (cur < target) {
      // Плавное ускоренное приближение к проценту с бэкенда
      const step = Math.max(0.4, (target - cur) * 0.15);
      next = Math.min(target, cur + step);
    } else if (cur < 97) {
      // Если бэкенд долго выполняет шаг — медленно ползём вперёд (~0.3% в секунду)
      next = Math.min(97, cur + 0.05);
    }

    currentProgressRef.current = next;
    const rounded = Math.round(next);
    setTotalProgress(rounded);

    // Обновляем шаг по проценту, если нет явного шага от бэкенда
    if (stepsRef.current.length > 0) {
      const computedIdx = Math.max(
        0,
        Math.min(
          stepsRef.current.length - 1,
          Math.floor((rounded / 100) * stepsRef.current.length),
        ),
      );
      setStepIndex((prev) => Math.max(prev, computedIdx));
    }
  }, []);

  const applyBackendProgress = useCallback((progress?: BackendProgress) => {
    if (!progress) return;
    if (typeof progress.label === "string" && progress.label.trim()) {
      backendLabelRef.current = progress.label.trim();
      setBackendStageLabel(progress.label.trim());
    }
    if (typeof progress.eta_seconds === "number") {
      setEtaSeconds(Math.max(0, progress.eta_seconds));
    }
    if (typeof progress.percent === "number" && !isNaN(progress.percent)) {
      const p = Math.max(4, Math.min(98, Math.round(progress.percent)));
      if (p > targetProgressRef.current) {
        targetProgressRef.current = p;
      }
    }
    if (
      typeof progress.step === "number" &&
      typeof progress.total_steps === "number" &&
      progress.total_steps > 0
    ) {
      const count = stepsRef.current.length || progress.total_steps;
      const idx = Math.max(
        0,
        Math.min(count - 1, Math.floor((progress.step / progress.total_steps) * count)),
      );
      setStepIndex(idx);
    }
  }, []);

  const startProgress = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    currentProgressRef.current = Math.max(currentProgressRef.current, 4);
    targetProgressRef.current = Math.max(targetProgressRef.current, 8);
    setTotalProgress(Math.round(currentProgressRef.current));
    timerRef.current = setInterval(tickSmoothProgress, 150);
  }, [tickSmoothProgress]);

  const triggerExtras = useCallback(async (items: string[], src: ReferatResult, wt: string, title: string) => {
    if (!items.length) return;

    let toRun = [...items];
    const genId = extrasGenIdRef.current;
    if (genId) {
      try {
        const gr = await fetch(`/api/generations/${genId}`, { cache: "no-store" });
        if (gr.ok) {
          const row = (await gr.json()) as { extras?: string | null };
          if (row.extras) {
            const ex = JSON.parse(row.extras) as Record<string, unknown>;
            toRun = items.filter((item) => {
              if (item === "presentation") return typeof ex.presentation !== "string";
              if (item === "speech") return typeof ex.speech !== "string";
              return true;
            });
            const ready: string[] = [];
            if (typeof ex.presentation === "string") ready.push("presentation");
            if (typeof ex.speech === "string") ready.push("speech");
            if (ready.length) {
              setExtrasReady(ready);
              setPresentationJobId(typeof ex.presentation === "string" ? ex.presentation : null);
              setSpeechJobId(typeof ex.speech === "string" ? ex.speech : null);
              setExtrasJobId(
                typeof ex.presentation === "string"
                  ? ex.presentation
                  : typeof ex.speech === "string"
                    ? ex.speech
                    : null,
              );
            }
          }
        }
      } catch {
        /* start fresh */
      }
    }

    if (!toRun.length) return;

    setExtrasGenerating(true);
    setExtrasError(null);
    setExtrasJobId(null);
    setPresentationJobId(null);
    setSpeechJobId(null);
    extrasProgressRef.current = 5;
    setExtrasProgress(5);

    try {
      const res = await fetch("/api/generate/extras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: src.title || title,
          work_type: wt,
          items: toRun,
          result: src,
          profile: src.profile ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.extrasJobId) {
        setExtrasError(data.error || "Ошибка запуска доп. материалов");
        setExtrasGenerating(false);
        return;
      }
      setExtrasJobId(data.extrasJobId);
    } catch {
      setExtrasError("Сервер недоступен");
      setExtrasGenerating(false);
    }
  }, []);

  const pollGenerationLoop = useCallback(
    async (wt: string, extrasItems: string[], t: string) => {
      const deadline = Date.now() + GENERATE_MAX_WAIT_MS;
      while (Date.now() < deadline) {
        const pollRes = await fetch(
          `/api/generate/poll?workType=${encodeURIComponent(wt)}&startedAt=${startedAtRef.current}&includeResult=1` +
            (generationIdRef.current
              ? `&generationId=${encodeURIComponent(generationIdRef.current)}`
              : ""),
          { cache: "no-store" },
        );
        const pollData = await pollRes.json();
        applyBackendProgress(pollData.progress);

        if (pollData.status === "done") {
          let resultData = pollData.result as ReferatResult | undefined;
          if (!resultData && pollData.id) {
            try {
              const genRes = await fetch(`/api/generations/${encodeURIComponent(String(pollData.id))}`, {
                cache: "no-store",
              });
              if (genRes.ok) {
                const genData = (await genRes.json()) as { result?: ReferatResult };
                if (genData.result) resultData = genData.result;
              }
            } catch {
              /* ignore */
            }
          }
          if (resultData) {
            stopProgress();
            sessionStorage.removeItem("activeGeneration");
            if (pollData.id) {
              setGenerationId(String(pollData.id));
              extrasGenIdRef.current = String(pollData.id);
            }
            if (pollData.slug) setGenerationSlug(String(pollData.slug));
            setResult(resultData);
            setLoading(false);
            if (extrasItems.length > 0) {
              void triggerExtras(extrasItems, resultData, wt, t);
            }
            return;
          }
        }

        if (pollData.status === "error" || pollData.status === "not_found") {
          stopProgress();
          sessionStorage.removeItem("activeGeneration");
          setError(pollData.error || "Сервис сейчас перегружен. Попробуйте снова.");
          setLoading(false);
          return;
        }

        await new Promise((r) => setTimeout(r, GENERATE_POLL_MS));
      }

      stopProgress();
      sessionStorage.removeItem("activeGeneration");
      setError("Превышено время ожидания. Проверьте «Мои работы» — работа могла сохраниться.");
      setLoading(false);
    },
    [applyBackendProgress, stopProgress, triggerExtras],
  );

  const run = useCallback(
    async (params: {
      topic: string;
      pages: number;
      workType: string;
      extrasItems?: string[];
      taskId?: string;
      structure?: string[];
      /** Явное согласие опубликовать работу (opt-in с checkout). По умолчанию приватно. */
      isPublic?: boolean;
      onGenerateStarted?: () => void;
      onGenerationId?: (generationId: string, startedAt: number) => void;
    }) => {
      const {
        topic: t,
        pages: p,
        workType: wt,
        extrasItems = [],
        onGenerateStarted,
        onGenerationId,
        structure,
        isPublic,
      } = params;
      stepsRef.current = getProgressSteps(wt);
      startedAtRef.current = Date.now();
      generationIdRef.current = null;
      extrasGenIdRef.current = null;
      backendLabelRef.current = "";

      setWorkType(wt);
      setTopic(t);
      setLoading(true);
      setError(null);
      setResult(null);
      setGenerationId(null);
      setGenerationSlug(null);
      setExtrasGenerating(false);
      setExtrasReady([]);
      setExtrasError(null);
      setExtrasJobId(null);
      setPresentationJobId(null);
      currentProgressRef.current = 4;
      targetProgressRef.current = 8;
      setTotalProgress(4);
      setStepIndex(0);
      setEtaSeconds(null);
      setBackendStageLabel("");

      sessionStorage.setItem(
        "activeGeneration",
        JSON.stringify({ topic: t, pages: p, workType: wt, startedAt: startedAtRef.current }),
      );

      startProgress();

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: t,
            pages: p,
            workType: wt,
            taskId: params.taskId,
            ...(isPublic === true ? { isPublic: true } : {}),
            ...(structure && structure.length >= 3 ? { structure } : {}),
          }),
        });
        const data = await response.json();

        if (!response.ok) {
          stopProgress();
          sessionStorage.removeItem("activeGeneration");
          const errMsg =
            data.error ||
            (response.status === 403 ? "Требуется оплата или доступ к типу работы" : "Произошла ошибка");
          setError(errMsg);
          setLoading(false);
          return;
        }

        const genId = typeof data.generationId === "string" ? data.generationId : "";
        if (data.alreadyRunning && genId) {
          // Повторный POST после reload — продолжаем poll существующей генерации
          const stored = sessionStorage.getItem("activeGeneration");
          let resumeStarted = startedAtRef.current;
          if (stored) {
            try {
              const parsed = JSON.parse(stored) as { startedAt?: number };
              if (typeof parsed.startedAt === "number" && parsed.startedAt > 0) {
                resumeStarted = parsed.startedAt;
                startedAtRef.current = resumeStarted;
              }
            } catch {
              /* ignore */
            }
          }
          generationIdRef.current = genId;
          extrasGenIdRef.current = genId;
          setGenerationId(genId);
          sessionStorage.setItem(
            "activeGeneration",
            JSON.stringify({
              topic: t,
              pages: p,
              workType: wt,
              startedAt: resumeStarted,
              generationId: genId,
            }),
          );
          onGenerationId?.(genId, resumeStarted);
          onGenerateStarted?.();
          await pollGenerationLoop(wt, extrasItems, t);
          return;
        }

        if (genId) {
          generationIdRef.current = genId;
          extrasGenIdRef.current = genId;
          setGenerationId(genId);
          sessionStorage.setItem(
            "activeGeneration",
            JSON.stringify({
              topic: t,
              pages: p,
              workType: wt,
              startedAt: startedAtRef.current,
              generationId: genId,
            }),
          );
          onGenerationId?.(genId, startedAtRef.current);
        }
        onGenerateStarted?.();

        await pollGenerationLoop(wt, extrasItems, t);
      } catch {
        stopProgress();
        sessionStorage.removeItem("activeGeneration");
        setError("Сервер недоступен. Проверьте «Мои работы» позже.");
        setLoading(false);
      }
    },
    [pollGenerationLoop, startProgress, stopProgress],
  );

  const resume = useCallback(
    async (params: {
      topic: string;
      pages: number;
      workType: string;
      generationId: string;
      startedAt: number;
      extrasItems?: string[];
    }) => {
      const {
        topic: t,
        pages: p,
        workType: wt,
        generationId: genId,
        startedAt,
        extrasItems = [],
      } = params;

      stepsRef.current = getProgressSteps(wt);
      startedAtRef.current = startedAt;
      generationIdRef.current = genId || null;
      extrasGenIdRef.current = genId || null;
      backendLabelRef.current = "";

      setWorkType(wt);
      setTopic(t);
      setLoading(true);
      setError(null);
      setResult(null);
      setGenerationId(genId || null);
      setGenerationSlug(null);
      setExtrasGenerating(false);
      setExtrasReady([]);
      setExtrasError(null);
      setExtrasJobId(null);
      setPresentationJobId(null);
      setSpeechJobId(null);
      const elapsed = Math.max(0, Date.now() - startedAt);
      const est = Math.min(85, Math.max(6, Math.round((elapsed / 60000) * 35)));
      currentProgressRef.current = est;
      targetProgressRef.current = est + 2;
      setTotalProgress(est);
      setEtaSeconds(null);
      setBackendStageLabel("");

      sessionStorage.setItem(
        "activeGeneration",
        JSON.stringify({
          topic: t,
          pages: p,
          workType: wt,
          startedAt,
          generationId: genId,
        }),
      );

      startProgress();

      try {
        await pollGenerationLoop(wt, extrasItems, t);
      } catch {
        stopProgress();
        sessionStorage.removeItem("activeGeneration");
        setError("Сервер недоступен. Проверьте «Мои работы» позже.");
        setLoading(false);
      }
    },
    [pollGenerationLoop, startProgress, stopProgress],
  );

  useEffect(() => {
    if (!loading) {
      setDots(".");
      return;
    }
    const id = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "." : d + "."));
    }, 500);
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => {
    if (!extrasGenerating) {
      extrasProgressRef.current = 0;
      setExtrasProgress(0);
      return;
    }
    extrasProgressRef.current = 5;
    setExtrasProgress(5);
    const id = setInterval(() => {
      const cur = extrasProgressRef.current;
      const inc = cur < 40 ? 1.5 : cur < 70 ? 0.5 : 0.15;
      const next = Math.min(88, cur + inc);
      extrasProgressRef.current = next;
      setExtrasProgress(next);
    }, 300);
    return () => clearInterval(id);
  }, [extrasGenerating]);

  useEffect(() => {
    if (!extrasJobId || !extrasGenerating) return;
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/generate/extras/status/${extrasJobId}`, { cache: "no-store" });
        const data = await res.json();

        if (data.status === "done") {
          const readyItems: string[] = data.ready ?? [];
          const jobId = extrasJobId as string;
          extrasProgressRef.current = 100;
          setExtrasProgress(100);

          const savedGenId = extrasGenIdRef.current;
          if (savedGenId && readyItems.length > 0) {
            let prev: Record<string, unknown> = {};
            try {
              const gr = await fetch(`/api/generations/${savedGenId}`);
              if (gr.ok) {
                const row = await gr.json();
                if (row.extras && typeof row.extras === "string") {
                  try {
                    prev = JSON.parse(row.extras) as Record<string, unknown>;
                  } catch {
                    prev = {};
                  }
                }
              }
            } catch {
              prev = {};
            }
            const merged: Record<string, unknown> = { ...prev };
            readyItems.forEach((item) => {
              merged[item] = jobId;
            });
            if (data.slides) merged.presentationSlides = data.slides;
            try {
              await fetch(`/api/generations/${savedGenId}/extras`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ extras: merged }),
              });
            } catch {
              /* сохранение не блокирует UI */
            }
          }

          setExtrasGenerating(false);
          setExtrasReady(readyItems);
          if (readyItems.includes("presentation")) {
            setPresentationJobId(jobId);
            setExtrasJobId(jobId);
          }
          if (readyItems.includes("speech")) {
            setSpeechJobId(jobId);
            if (!readyItems.includes("presentation")) setExtrasJobId(jobId);
          }
          return;
        }

        if (data.status === "error" || data.status === "not_found") {
          setExtrasError(data.error || "Ошибка генерации доп. материалов");
          setExtrasGenerating(false);
          return;
        }
      } catch {
        /* retry */
      }
      if (!cancelled) setTimeout(poll, 4_000);
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [extrasJobId, extrasGenerating]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const hydrateCompleted = useCallback(
    (params: {
      result: ReferatResult;
      generationId: string;
      generationSlug?: string | null;
      workType: string;
      topic: string;
      extrasRaw?: string | null;
    }) => {
      setWorkType(params.workType);
      setTopic(params.topic);
      setGenerationId(params.generationId);
      setGenerationSlug(params.generationSlug ?? null);
      setResult(params.result);
      setLoading(false);
      setError(null);
      setExtrasGenerating(false);
      setExtrasError(null);
      stopProgress();

      let extras: Record<string, unknown> = {};
      if (params.extrasRaw) {
        try {
          const parsed = JSON.parse(params.extrasRaw) as unknown;
          if (parsed && typeof parsed === "object") extras = parsed as Record<string, unknown>;
        } catch {
          /* ignore */
        }
      }

      const ready: string[] = [];
      if (typeof extras.presentation === "string") ready.push("presentation");
      if (typeof extras.speech === "string") ready.push("speech");
      setExtrasReady(ready);
      const presId = typeof extras.presentation === "string" ? extras.presentation : null;
      const speechId = typeof extras.speech === "string" ? extras.speech : null;
      setPresentationJobId(presId);
      setSpeechJobId(speechId);
      setExtrasJobId(presId ?? speechId);
    },
    [stopProgress],
  );

  const downloadDocx = useCallback(async () => {
    if (!result) return;
    const response = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...result,
        _activity: {
          action: "DOCX_DOWNLOAD",
          source: "home",
          generationId,
          slug: generationSlug,
          workType,
        },
      }),
    });
    if (!response.ok) throw new Error("download failed");
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.title.replace(/[«»:]/g, "").trim()}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }, [generationId, generationSlug, result, workType]);

  const downloadPresentation = useCallback(async () => {
    const jobId = presentationJobId ?? extrasJobId;
    if (!jobId) return;
    const res = await fetch(`/api/download/presentation/${jobId}`, { cache: "no-store" });
    if (!res.ok) throw new Error("bad response");
    const blob = await res.blob();
    trackWorkActivityClient({
      action: "PPTX_DOWNLOAD",
      source: "home",
      generationId,
      slug: generationSlug,
      workType,
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "presentation.pptx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }, [presentationJobId, extrasJobId, generationId, generationSlug, workType]);

  const downloadSpeech = useCallback(async () => {
    const jobId = speechJobId ?? extrasJobId;
    if (!jobId) return;
    const res = await fetch(`/api/download/speech/${jobId}`);
    if (!res.ok) throw new Error("bad response");
    const blob = await res.blob();
    trackWorkActivityClient({
      action: "SPEECH_DOWNLOAD",
      source: "home",
      generationId,
      slug: generationSlug,
      workType,
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "speech.docx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }, [speechJobId, extrasJobId, generationId, generationSlug, workType]);

  return {
    loading,
    error,
    result,
    generationId,
    generationSlug,
    workType,
    topic,
    stepIndex,
    totalProgress,
    etaSeconds,
    backendStageLabel,
    dots,
    steps: stepsRef,
    extrasGenerating,
    extrasReady,
    extrasError,
    extrasProgress,
    run,
    resume,
    hydrateCompleted,
    downloadDocx,
    downloadPresentation,
    downloadSpeech,
    startExtras: triggerExtras,
  };
}
