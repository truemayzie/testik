"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import styles from "./dashboard.module.css";
import IonPresentationPreview from "../components/IonPresentationPreview";
import { extractSlidesFromPresentationSlides, type IonSlide } from "@/lib/presentationSlides";
import { useModalA11y } from "../lib/useModalA11y";
import { trackWorkActivityClient } from "@/app/lib/trackWorkActivity";
import { findOrderTaskIdByGenerationId } from "@/lib/orderGenerationSession";
import { detectPaymentMarket } from "@/lib/paymentMarket";

type Generation = {
  id: string;
  topic: string;
  pages: number;
  workType: string;
  status: string;
  createdAt: string;
  slug: string | null;
  extras: string | null; // JSON: {"presentation":"job_id","speech":"job_id"}
};

type PendingOrder = {
  id: string;
  topic: string;
  pages: number;
  workType: string;
  createdAt: string;
  status: "awaiting_payment";
};

type ReferatResult = {
  title: string;
  structure: string[];
  content: Record<string, string>;
  sources: string[];
  meta: Record<string, string | number>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile?: Record<string, any>;
};

type PresentationSlides = {
  accent?: string;
  slides?: unknown[];
  provider?: string;
};

type ExtrasData = {
  presentation?: string;
  speech?: string;
  presentationSlides?: PresentationSlides;
  _taskId?: string;
};

type ViewingGen = {
  id: string;
  topic: string;
  workType: string;
  pages: number;
  slug: string | null;
  extras: ExtrasData | null;
  result: ReferatResult;
};

const DOC_WIDTH = 816;

const TITLE_PAGE_TYPES = ["Реферат", "Курсовая", "ВКР", "Доклад"];

/** Типы, для которых доступны презентация и текст выступления */
const WORK_TYPES_WITHOUT_EXTRAS = new Set(["Сочинение", "Эссе"]);

/** Защита от двойного чтения pendingExtras при Strict Mode */
let extrasDashboardResumeSync = false;

function supportsExtras(workType: string) {
  return !WORK_TYPES_WITHOUT_EXTRAS.has(workType);
}

type TitleForm = {
  fullName: string; university: string; faculty: string;
  department: string; groupNumber: string; teacherName: string;
  city: string; speciality: string; discipline: string;
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Feedback modal (?bad=1 из письма-оценки)
  const FEEDBACK_ISSUES = ["Структура", "Объём", "Оформление", "Содержание", "Другое"] as const;
  const [feedbackOpen, setFeedbackOpen]         = useState(false);
  const [feedbackGenId, setFeedbackGenId]       = useState<string | null>(null);
  const [feedbackIssues, setFeedbackIssues]     = useState<string[]>([]);
  const [feedbackComment, setFeedbackComment]   = useState("");
  const [feedbackSending, setFeedbackSending]   = useState(false);
  const [feedbackDone, setFeedbackDone]         = useState(false);

  const [generations, setGenerations] = useState<Generation[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const visiblePendingOrders = useMemo(() => {
    return pendingOrders.filter((order) => {
      const topicKey = order.topic.trim().toLowerCase();
      return !generations.some(
        (g) =>
          g.topic.trim().toLowerCase() === topicKey &&
          g.workType === order.workType &&
          g.status !== "failed",
      );
    });
  }, [pendingOrders, generations]);
  const [loadingList, setLoadingList] = useState(true);
  const [giftWorkType, setGiftWorkType] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting]       = useState<string | null>(null);
  const [copiedId, setCopiedId]       = useState<string | null>(null);

  // DOCX-предпросмотр
  const [viewingGen, setViewingGen]   = useState<ViewingGen | null>(null);
  const [viewingClosing, setViewingClosing] = useState(false);
  const [loadingView, setLoadingView] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const baseScaleRef        = useRef<number>(1);
  const viewerModalRef      = useRef<HTMLDivElement>(null);
  const viewerCloseRef      = useRef<HTMLButtonElement>(null);

  // Табы модального окна
  const [modalTab, setModalTab]         = useState<"work" | "presentation">("work");
  const [presSlides, setPresSlides]     = useState<IonSlide[] | null>(null);
  const [downloadingPptx, setDownloadingPptx] = useState(false);

  // Титульный лист
  const [titleForm, setTitleForm]     = useState<TitleForm>({ fullName: "", university: "", faculty: "", department: "", groupNumber: "", teacherName: "", city: "", speciality: "", discipline: "" });
  const [titleUpdating, setTitleUpdating] = useState(false);
  const [saveProfile, setSaveProfile] = useState(false);
  const [skipFaculty, setSkipFaculty]       = useState(false);
  const [skipSpeciality, setSkipSpeciality] = useState(false);
  const [skipDiscipline, setSkipDiscipline] = useState(false);
  const [showMobileTitleForm, setShowMobileTitleForm] = useState(false);

  const userRole    = (session?.user as { role?: string } | null)?.role;
  const isAdminUser = userRole === "admin";

  const [dashPresSel, setDashPresSel]     = useState(false);
  const [dashSpeechSel, setDashSpeechSel] = useState(false);
  const [dashExtrasBusy, setDashExtrasBusy] = useState(false);
  const [dashExtrasErr, setDashExtrasErr]   = useState<string | null>(null);
  /** Прогресс после старта extras */
  const [dashExtrasProgress, setDashExtrasProgress] = useState(0);
  const dashExtrasProgRef = useRef(0);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [status, router]);

  // Открываем feedback modal если пришли с ?bad=1 из письма
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("bad") === "1") {
      setFeedbackGenId(params.get("generationId"));
      setFeedbackOpen(true);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      Promise.all([
        fetch("/api/generations").then((r) => r.json()),
        fetch("/api/tasks", { cache: "no-store" }).then((r) => r.json()),
      ])
        .then(([gens, tasks]) => {
          setGenerations(Array.isArray(gens) ? gens : []);
          setPendingOrders(Array.isArray(tasks) ? tasks : []);
          setLoadingList(false);
        })
        .catch(() => setLoadingList(false));
    }
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const hasRunning = generations.some(
      (g) => g.status !== "completed" && g.status !== "failed",
    );
    if (!hasRunning) return;

    const timer = window.setInterval(() => {
      void fetch("/api/generations", { cache: "no-store" })
        .then((r) => r.json())
        .then((list) => {
          if (Array.isArray(list)) setGenerations(list);
        })
        .catch(() => {});
    }, 5000);

    return () => window.clearInterval(timer);
  }, [status, generations]);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/gift")
        .then(r => r.json())
        .then(data => { if (data.hasGift) setGiftWorkType(data.workType); })
        .catch(() => {});
    }
  }, [status]);

  useModalA11y({
    active: !!viewingGen,
    containerRef: viewerModalRef,
    initialFocusRef: viewerCloseRef,
    onClose: closeViewer,
  });

  // Блокировать скролл фона когда модалка открыта.
  // position:fixed надёжнее overflow:hidden на iOS Safari — браузер не прокручивает фон.
  useEffect(() => {
    if (viewingGen) {
      const y = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top      = `-${y}px`;
      document.body.style.width    = "100%";
      document.body.style.overflow = "hidden";
    } else {
      const y = parseInt(document.body.style.top || "0") * -1;
      document.body.style.position = "";
      document.body.style.top      = "";
      document.body.style.width    = "";
      document.body.style.overflow = "";
      window.scrollTo(0, y);
    }
    return () => {
      const y = parseInt(document.body.style.top || "0") * -1;
      document.body.style.position = "";
      document.body.style.top      = "";
      document.body.style.width    = "";
      document.body.style.overflow = "";
      if (y) window.scrollTo(0, y);
    };
  }, [viewingGen]);

  function applyScale(container: HTMLElement, scale: number) {
    container.style.setProperty("--docx-scale", String(scale));
    if (scale < 1) {
      const w = DOC_WIDTH;
      const h = container.scrollHeight;
      container.style.transform = `scale(${scale})`;
      container.style.transformOrigin = "top center";
      container.style.marginBottom = `${Math.round(h * scale - h)}px`;
      container.style.position = "relative";
      container.style.left = "50%";
      container.style.marginLeft = `-${w / 2}px`;
    } else {
      container.style.transform = "";
      container.style.transformOrigin = "";
      container.style.marginBottom = "";
      container.style.position = "";
      container.style.left = "";
      container.style.marginLeft = "";
    }
  }

  async function renderPreview(data: ReferatResult) {
    const container = previewContainerRef.current;
    if (!container) return;

    container.innerHTML = "";
    container.style.transform    = "";
    container.style.marginBottom = "";
    container.style.width = `${DOC_WIDTH}px`;

    const targetWidth = container.parentElement?.clientWidth
      ? Math.min(container.parentElement.clientWidth, window.innerWidth)
      : window.innerWidth;

    setPreviewLoading(true);
    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const { renderAsync } = await import("docx-preview");

      await renderAsync(blob, container, undefined, {
        className: "docx-preview",
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        experimental: true,
      });
      // experimental=true запускает refreshTabStops через setTimeout(500мс).
      // Применяем scale только ПОСЛЕ него — иначе dot-leader расчёт ломается.
      await new Promise<void>(r => setTimeout(r, 600));
      const base = Math.min(1, targetWidth / DOC_WIDTH);
      baseScaleRef.current = base;
      setPreviewZoom(1);
      applyScale(container, base);
    } catch (e) {
      console.error("[DashPreview] Error:", e);
    } finally {
      setPreviewLoading(false);
    }
  }

  function applyZoom(delta: number) {
    const container = previewContainerRef.current;
    if (!container) return;
    const next = Math.min(2, Math.max(0.3, previewZoom + delta));
    setPreviewZoom(next);
    applyScale(container, baseScaleRef.current * next);
  }

  // Запускаем превью когда модал открылся и ref доступен
  useEffect(() => {
    if (!viewingGen) return;
    renderPreview(viewingGen.result);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingGen?.id]);

  // При открытии модалки — загружаем профиль и заполняем поля титульника
  useEffect(() => {
    if (!viewingGen) return;
    fetch("/api/profile")
      .then(r => r.json())
      .then((data: Record<string, string>) => {
        const hasData = !!(data.fullName || data.university || data.groupNumber);
        setSaveProfile(hasData);
        setTitleForm({
          fullName:    data.fullName    || "",
          university:  data.university  || "",
          faculty:     data.faculty     || "",
          department:  data.department  || "",
          groupNumber: data.groupNumber || "",
          teacherName: data.teacherName || "",
          city:        data.city        || "",
          speciality:  data.speciality  || "",
          discipline:  data.discipline  || "",
        });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingGen?.id]);

  async function handleOpen(id: string) {
    setLoadingView(id);
    try {
      const res  = await fetch(`/api/generations/${id}`);
      const data = await res.json();
      const result: ReferatResult = data.result;
      const gen = generations.find(g => g.id === id);
      let extrasObj: ExtrasData | null = null;
      const extrasRaw =
        typeof data.extras === "string" ? data.extras : (typeof gen?.extras === "string" ? gen.extras : null);
      if (extrasRaw?.trim()) {
        try {
          extrasObj = JSON.parse(extrasRaw) as ExtrasData;
        } catch {
          extrasObj = null;
        }
      }
      let extrasForView: ExtrasData | null = extrasObj;
      let extracted = extractSlidesFromPresentationSlides(extrasForView?.presentationSlides);
      if (
        (!extracted || extracted.length === 0) &&
        extrasForView?.presentation &&
        supportsExtras(data.workType ?? gen?.workType ?? "")
      ) {
        try {
          const sr = await fetch(`/api/presentation/slides/${extrasForView.presentation}`, {
            cache: "no-store",
          });
          if (sr.ok) {
            const backup = (await sr.json()) as PresentationSlides;
            extracted = extractSlidesFromPresentationSlides(backup);
            if (extracted && extracted.length > 0 && extrasForView) {
              extrasForView = { ...extrasForView, presentationSlides: backup };
              void fetch(`/api/generations/${data.id}/extras`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ extras: extrasForView }),
              }).catch(() => {});
            }
          }
        } catch {
          /* noop */
        }
      }

      setViewingGen({
        id:      data.id,
        topic:   data.topic ?? gen?.topic ?? "",
        workType: data.workType ?? gen?.workType ?? "Реферат",
        pages:   data.pages ?? gen?.pages ?? 0,
        slug:    data.slug ?? gen?.slug ?? null,
        extras:  extrasForView,
        result,
      });
      // Инициализируем слайды для вкладки Презентация
      setModalTab("work");
      setPresSlides(extracted && extracted.length > 0 ? extracted : null);
      setDashPresSel(false);
      setDashSpeechSel(false);
      setDashExtrasErr(null);
    } catch {
      alert("Не удалось загрузить работу");
    } finally {
      setLoadingView(null);
    }
  }

  function closeViewer() {
    setViewingClosing(true);
    setTimeout(() => {
      setViewingGen(null);
      setViewingClosing(false);
      setDashPresSel(false);
      setDashSpeechSel(false);
      setDashExtrasBusy(false);
      setDashExtrasErr(null);
    }, 200);
  }

  async function mergeExtrasAfterPoll(genId: string, jobId: string, poll: { ready?: string[]; slides?: unknown }) {
    const genRes = await fetch(`/api/generations/${genId}`);
    if (!genRes.ok) throw new Error("Не удалось загрузить работу");
    const genRow = await genRes.json();
    let prev: Record<string, unknown> = {};
    try {
      if (genRow.extras) prev = JSON.parse(genRow.extras as string);
    } catch {
      prev = {};
    }
    const merged: Record<string, unknown> = { ...prev };
    (poll.ready ?? []).forEach((item: string) => {
      merged[item] = jobId;
    });
    if (poll.slides) merged.presentationSlides = poll.slides;
    const pr = await fetch(`/api/generations/${genId}/extras`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extras: merged }),
    });
    if (!pr.ok) {
      console.error("[dashboard extras PATCH]", pr.status, await pr.text());
      throw new Error("Не удалось сохранить презентацию в профиле. Проверьте лимиты сервера.");
    }
  }

  /** Обновить модал и слайды из БД после extras */
  async function hydrateViewerAfterExtras(genId: string) {
    const genRes = await fetch(`/api/generations/${genId}`);
    if (!genRes.ok) return;
    const genRow = await genRes.json();
    let extrasObj: ExtrasData | null = null;
    try {
      extrasObj = genRow.extras ? JSON.parse(genRow.extras as string) : null;
    } catch {
      extrasObj = null;
    }
    setViewingGen({
      id:       genRow.id,
      topic:    genRow.topic,
      workType: genRow.workType,
      pages:    genRow.pages,
      slug:     genRow.slug ?? null,
      extras:   extrasObj,
      result:   genRow.result as ReferatResult,
    });
    setPresSlides(extractSlidesFromPresentationSlides(extrasObj?.presentationSlides));
    if (extrasObj?.presentation) {
      setModalTab("presentation");
    }
  }

  /** Запуск extras из кабинета (поллинг + сохранение в БД). */
  async function runDashboardExtras(
    items: string[],
    genId: string,
    resPayload: ReferatResult,
    wt: string,
    topic: string,
  ) {
    setDashExtrasBusy(true);
    setDashExtrasErr(null);
    try {
      const r = await fetch("/api/generate/extras", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic:     resPayload.title || topic,
          work_type: wt,
          items,
          result:    resPayload,
          profile:   resPayload.profile ?? null,
        }),
      });
      const data = await r.json();
      if (!r.ok || typeof data?.extrasJobId !== "string") {
        setDashExtrasErr(typeof data?.error === "string" ? data.error : "Не удалось запустить генерацию");
        return;
      }
      const jobId = data.extrasJobId as string;
      for (;;) {
        await new Promise(ok => setTimeout(ok, 4000));
        const stRes = await fetch(`/api/generate/extras/status/${jobId}`, { cache: "no-store" });
        const st    = await stRes.json();

        if (st.status === "done") {
          await mergeExtrasAfterPoll(genId, jobId, st);
          try {
            const listRes = await fetch("/api/generations");
            const list    = await listRes.json();
            if (Array.isArray(list)) setGenerations(list);
          } catch { /* noop */ }
          await hydrateViewerAfterExtras(genId);
          return;
        }
        if (st.status === "error" || st.status === "not_found") {
          setDashExtrasErr(typeof st.error === "string" ? st.error : "Ошибка генерации");
          return;
        }
      }
    } catch {
      setDashExtrasErr("Сервер недоступен");
    } finally {
      setDashExtrasBusy(false);
      setDashExtrasProgress(0);
      dashExtrasProgRef.current = 0;
    }
  }

  async function handleDashboardExtrasPayment() {
    const v = viewingGen;
    if (!v) return;

    const hasPresReady = !!(v.extras?.presentationSlides || v.extras?.presentation);
    const dashCanPres   = supportsExtras(v.workType) && !hasPresReady;
    const dashCanSpeech = supportsExtras(v.workType) && !v.extras?.speech;

    const items: string[] = [];
    if (dashPresSel && dashCanPres) items.push("presentation");
    if (dashSpeechSel && dashCanSpeech) items.push("speech");
    if (!items.length) return;

    if (isAdminUser) {
      await runDashboardExtras(items, v.id, v.result, v.workType, v.topic);
      return;
    }

    const basePayload = {
      result: v.result,
      workType: v.workType,
      pages:    v.pages,
      topic:    v.topic,
      items,
      returnTo:       "dashboard" as const,
      generationId:   v.id,
    };

    try {
      sessionStorage.setItem("pendingExtras", JSON.stringify(basePayload));
      const res = await fetch("/api/payment/extras", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ items, market: detectPaymentMarket() }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(typeof data?.error === "string" ? data.error : "Ошибка платежа");
        return;
      }
      if (data.autoSucceed) {
        sessionStorage.removeItem("pendingExtras");
        await runDashboardExtras(items, v.id, v.result, v.workType, v.topic);
      } else {
        sessionStorage.setItem(
          "pendingExtras",
          JSON.stringify({
            ...basePayload,
            paymentId: data.paymentId as string,
          }),
        );
        window.location.href = data.paymentUrl as string;
      }
    } catch {
      alert("Не удалось создать платёж");
    }
  }

  /** Вернулся платёж за extras из кабинета */
  useEffect(() => {
    if (status !== "authenticated") return;
    const p =
      typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    if (!p?.get("extrasAutoGenerate")) return;

    if (extrasDashboardResumeSync) return;

    router.replace("/dashboard");

    const raw = sessionStorage.getItem("pendingExtras");
    let parsed: {
      items?: string[];
      generationId?: string;
      result?: ReferatResult;
      workType?: string;
      topic?: string;
      returnTo?: string;
    };
    try {
      if (!raw) return;
      parsed = JSON.parse(raw);
    } catch {
      sessionStorage.removeItem("pendingExtras");
      return;
    }

    if (parsed.returnTo !== "dashboard" || !parsed.generationId || !parsed.items?.length || !parsed.result) {
      return;
    }

    extrasDashboardResumeSync = true;
    sessionStorage.removeItem("pendingExtras");

    void runDashboardExtras(
      parsed.items,
      parsed.generationId,
      parsed.result,
      parsed.workType ?? "Реферат",
      parsed.topic ?? "",
    ).finally(() => {
      extrasDashboardResumeSync = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, router]);

  useEffect(() => {
    if (!dashExtrasBusy) {
      dashExtrasProgRef.current = 0;
      setDashExtrasProgress(0);
      return;
    }
    dashExtrasProgRef.current = 8;
    setDashExtrasProgress(8);
    const id = setInterval(() => {
      dashExtrasProgRef.current = Math.min(94, dashExtrasProgRef.current + 3 + Math.random() * 4);
      setDashExtrasProgress(Math.round(dashExtrasProgRef.current));
    }, 500);
    return () => clearInterval(id);
  }, [dashExtrasBusy]);

  async function persistProfile() {
    if (!saveProfile || !session?.user) return;
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(titleForm),
      });
    } catch {}
  }

  function buildProfilePayload() {
    return { ...titleForm, skipFaculty, skipSpeciality, skipDiscipline };
  }

  async function handleDownloadDocx(gen?: ViewingGen) {
    const src = gen ?? viewingGen;
    if (!src) return;
    const key = gen ? gen.id : "viewer";
    // Если скачиваем из просмотрщика — мержим данные титульника
    const baseBody = (!gen && TITLE_PAGE_TYPES.includes(src.workType))
      ? { ...src.result, profile: { ...(src.result.profile ?? {}), ...buildProfilePayload() } }
      : src.result;
    const docxBody = {
      ...baseBody,
      _activity: {
        action: "DOCX_DOWNLOAD",
        source: "dashboard",
        generationId: src.id,
        slug: src.slug,
        workType: src.workType,
      },
    };
    if (!gen) persistProfile();
    setDownloading(key);
    try {
      const docxRes = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(docxBody),
      });
      if (!docxRes.ok) throw new Error();
      const blob = await docxRes.blob();
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${src.result.title.replace(/[«»:]/g, "").trim()}.docx`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Не удалось скачать файл");
    } finally {
      setDownloading(null);
    }
  }

  async function handleTitleUpdate() {
    if (!viewingGen) return;
    setTitleUpdating(true);
    persistProfile();
    const updated = { ...viewingGen.result, profile: { ...(viewingGen.result.profile ?? {}), ...buildProfilePayload() } };
    await renderPreview(updated as typeof viewingGen.result);
    // Синхронизируем TITLE-слайд в презентации
    setPresSlides(prev => {
      if (!prev) return prev;
      const idx = prev.findIndex((s) => (s as { type?: string }).type === "TITLE");
      if (idx < 0) return prev;
      return prev.map((s, i) => i === idx ? {
        ...s,
        university: titleForm.university || "",
        full_name:  titleForm.fullName    || "",
        group:      titleForm.groupNumber || "",
        teacher:    titleForm.teacherName || "",
        city:       titleForm.city        || "",
        faculty:    titleForm.faculty     || "",
        department: titleForm.department  || "",
      } : s);
    });
    setTitleUpdating(false);
  }

  async function handleDownloadExtra(type: "presentation" | "speech") {
    if (!viewingGen?.extras) return;
    if (type === "presentation") {
      const presentationJobId = viewingGen.extras.presentation;
      if (!presentationJobId) {
        alert("Для этой работы не найден заказ презентации.");
        return;
      }
      setDownloadingPptx(true);
      try {
        const res = await fetch(`/api/download/presentation/${presentationJobId}`, { cache: "no-store" });
        if (!res.ok) {
          alert(
            "Файл презентации недоступен (временные файлы хранятся 24 ч). Оформите презентацию заново в блоке «Добавить материалы»."
          );
          return;
        }
        const blob = await res.blob();
        trackWorkActivityClient({
          action: "PPTX_DOWNLOAD",
          source: "dashboard",
          generationId: viewingGen.id,
          slug: viewingGen.slug,
          workType: viewingGen.workType,
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "presentation.pptx";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } catch {
        alert("Ошибка скачивания, попробуйте снова");
      } finally {
        setDownloadingPptx(false);
      }
      return;
    }
    // Речь — скачиваем по jobId из /tmp
    const jobId = viewingGen.extras.speech;
    if (!jobId) return;
    try {
      const res = await fetch(`/api/download/speech/${jobId}`);
      if (!res.ok) { alert("Файл недоступен. Перегенерируйте дополнительные материалы."); return; }
      const blob = await res.blob();
      trackWorkActivityClient({
        action: "SPEECH_DOWNLOAD",
        source: "dashboard",
        generationId: viewingGen.id,
        slug: viewingGen.slug,
        workType: viewingGen.workType,
      });
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = "speech.docx";
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch { alert("Не удалось скачать файл."); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить эту работу?")) return;
    setDeleting(id);
    try {
      await fetch(`/api/generations/${id}`, { method: "DELETE" });
      setGenerations(prev => prev.filter(g => g.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("ru-RU", {
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function parseExtras(raw: string | null): ExtrasData | null {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function resolveOrderTaskId(extras: ExtrasData | null, generationId: string): string | null {
    return extras?._taskId || findOrderTaskIdByGenerationId(generationId);
  }

  function openGenerationCard(gen: Generation, extras: ExtrasData | null, isCompleted: boolean) {
    if (isCompleted) {
      handleOpen(gen.id);
      return;
    }
    const orderId = resolveOrderTaskId(extras, gen.id);
    if (orderId) {
      router.push(`/order/${orderId}`);
    }
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.loadingSpinner} />
      </div>
    );
  }

  const user = session?.user;

  const vxDash = viewingGen;
  const dashExtrasAvail =
    !!(vxDash && supportsExtras(vxDash.workType));
  const dashHasPresReady =
    !!(vxDash?.extras?.presentationSlides || vxDash?.extras?.presentation);
  const dashCanOrderPres =
    !!(dashExtrasAvail && !dashHasPresReady);
  const dashCanOrderSpeech =
    !!(dashExtrasAvail && !vxDash?.extras?.speech);
  const dashShowExtrasOrder =
    !!(dashExtrasAvail && (dashCanOrderPres || dashCanOrderSpeech));
  const dashExtrasTotal =
    (dashPresSel && dashCanOrderPres ? 199 : 0) +
    (dashSpeechSel && dashCanOrderSpeech ? 149 : 0);
  const dashHasPresentationTab = !!vxDash?.extras?.presentation;
  const hasPresSlides = !!(presSlides && presSlides.length > 0);

  useEffect(() => {
    if (modalTab === "presentation" && !viewingGen?.extras?.presentation) {
      setModalTab("work");
    }
  }, [modalTab, viewingGen?.extras?.presentation]);

  return (
    <div className={styles.page}>

      {/* ── Hero-баннер ── */}
      <div className={styles.heroBanner}>
        <div className={styles.heroShape1} />
        <div className={styles.heroShape2} />
        <div className={styles.heroShape3} />
        <div className={styles.heroDocCards}>
          <div className={styles.heroDocCard}><div className={styles.hdLine}/><div className={styles.hdLine}/><div className={styles.hdLineShort}/><span>РЕФЕРАТ</span></div>
          <div className={`${styles.heroDocCard} ${styles.heroDocCardAlt}`}><div className={styles.hdLine}/><div className={styles.hdLine}/><div className={styles.hdLineShort}/><span>ЭССЕ</span></div>
          <div className={styles.heroDocCard}><div className={styles.hdLine}/><div className={styles.hdLine}/><div className={styles.hdLineShort}/><span>КУРСОВАЯ</span></div>
        </div>
        <div className={styles.heroBannerInner}>
          <div className={styles.heroBannerLeft}>
            <p className={styles.heroBannerGreeting}>Добро пожаловать</p>
            <h1 className={styles.heroBannerTitle}>
              Привет, {user?.name?.split(" ")[0] || "студент"}! 👋
            </h1>
            <div className={styles.heroBannerStats}>
              <div className={styles.heroBannerStat}>
                <span className={styles.heroBannerStatNum}>{generations.length}</span>
                <span className={styles.heroBannerStatLabel}>работ сохранено</span>
              </div>
              <div className={styles.heroBannerDivider}/>
              <div className={styles.heroBannerStat}>
                <span className={styles.heroBannerStatNum}>DOCX</span>
                <span className={styles.heroBannerStatLabel}>формат скачивания</span>
              </div>
              <div className={styles.heroBannerDivider}/>
              <div className={styles.heroBannerStat}>
                <span className={styles.heroBannerStatNum}>ГОСТ</span>
                <span className={styles.heroBannerStatLabel}>оформление</span>
              </div>
            </div>
          </div>
          <a href="/" className={styles.newBtn}>⚡ Новая работа</a>
        </div>
      </div>

      {giftWorkType && (
        <div className={styles.giftBanner}>
          <div className={styles.giftBannerInner}>
            <span className={styles.giftIcon}>🎁</span>
            <div className={styles.giftText}>
              <strong>Подарок от команды Refai</strong>
              <span>У вас есть бесплатная генерация — {giftWorkType}. Перейдите на главную и создайте работу!</span>
            </div>
            <a href="/" className={styles.giftBtn}>Использовать →</a>
          </div>
        </div>
      )}

      <main className={styles.main}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Мои работы</h2>

          {loadingList ? (
            <div className={styles.listLoading}>
              <div className={styles.loadingSpinner} />
              <span>Загружаем историю...</span>
            </div>
          ) : generations.length === 0 && visiblePendingOrders.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>📋</span>
              <p>У вас пока нет сохранённых работ</p>
              <a href="/" className={styles.emptyBtn}>Создать первую работу →</a>
            </div>
          ) : (
            <div className={styles.list}>
              {visiblePendingOrders.map((order) => (
                <div key={`pending-${order.id}`} className={`${styles.card} ${styles.cardAwaiting}`}>
                  <div
                    className={styles.cardLeft}
                    onClick={() => router.push(`/order/${order.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && router.push(`/order/${order.id}`)}
                  >
                    <div className={styles.cardBadges}>
                      <span className={styles.workType}>{order.workType}</span>
                      <span className={styles.extrasBadgeAwaiting}>Ожидает оплаты</span>
                    </div>
                    <h3 className={styles.cardTitle}>{order.topic}</h3>
                    <div className={styles.cardMeta}>
                      <span>~{order.pages} страниц</span>
                      <span className={styles.dot}>·</span>
                      <span suppressHydrationWarning>{formatDate(order.createdAt)}</span>
                    </div>
                  </div>
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={styles.openBtn}
                      onClick={() => router.push(`/order/${order.id}`)}
                    >
                      Оплатить
                    </button>
                  </div>
                </div>
              ))}
              {generations.map(gen => {
                const extrasData = parseExtras(gen.extras);
                const hasPresentation = !!extrasData?.presentation;
                const hasSpeech = !!extrasData?.speech;
                const isCompleted = gen.status === "completed";
                const isFailed = gen.status === "failed";
                const isRunning = !isCompleted && !isFailed;
                const orderTaskId = resolveOrderTaskId(extrasData, gen.id);
                const cardClickable = Boolean(orderTaskId) || isCompleted;
                return (
                  <div key={gen.id} className={styles.card}>
                    <div
                      className={styles.cardLeft}
                      onClick={() => openGenerationCard(gen, extrasData, isCompleted)}
                      role={cardClickable ? "button" : undefined}
                      tabIndex={cardClickable ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && cardClickable) {
                          openGenerationCard(gen, extrasData, isCompleted);
                        }
                      }}
                      style={cardClickable ? { cursor: "pointer" } : undefined}
                    >
                      <div className={styles.cardBadges}>
                        <span className={styles.workType}>{gen.workType}</span>
                        {isRunning && (
                          <span className={styles.extrasBadgeSpeech}>Генерация…</span>
                        )}
                        {isFailed && (
                          <span className={styles.extrasBadgePres}>Не завершилась</span>
                        )}
                        {hasPresentation && (
                          <span className={styles.extrasBadgePres}>Презентация</span>
                        )}
                        {hasSpeech && (
                          <span className={styles.extrasBadgeSpeech}>Выступление</span>
                        )}
                      </div>
                      <h3 className={styles.cardTitle}>{gen.topic}</h3>
                      <div className={styles.cardMeta}>
                        <span>~{gen.pages} страниц</span>
                        <span className={styles.dot}>·</span>
                        <span suppressHydrationWarning>{formatDate(gen.createdAt)}</span>
                      </div>
                    </div>
                    <div className={styles.cardActions}>
                      {isFailed ? (
                        <button
                          type="button"
                          className={styles.openBtn}
                          disabled
                          title="Генерация прервана. Напишите в поддержку или создайте работу заново."
                        >
                          Не завершилась
                        </button>
                      ) : isRunning ? (
                        <>
                          {orderTaskId ? (
                            <button
                              type="button"
                              className={styles.openBtn}
                              onClick={() => router.push(`/order/${orderTaskId}`)}
                            >
                              Открыть заказ
                            </button>
                          ) : null}
                          <button
                            className={styles.openBtnSecondary}
                            onClick={async (e) => {
                              e.stopPropagation();
                              setLoadingView(gen.id);
                              try {
                                const pollRes = await fetch(
                                  `/api/generate/poll?generationId=${encodeURIComponent(gen.id)}&includeResult=0`,
                                  { cache: "no-store" },
                                );
                                const pollData = await pollRes.json().catch(() => ({}));
                                if (pollData.status === "error" && pollData.error) {
                                  alert(String(pollData.error));
                                }
                                const listRes = await fetch("/api/generations", { cache: "no-store" });
                                const list = await listRes.json();
                                if (Array.isArray(list)) setGenerations(list);
                              } finally {
                                setLoadingView(null);
                              }
                            }}
                            disabled={loadingView === gen.id}
                          >
                            {loadingView === gen.id ? <span className={styles.btnSpinner} /> : "Проверить"}
                          </button>
                        </>
                      ) : (
                      <button
                        className={styles.openBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpen(gen.id);
                        }}
                        disabled={loadingView === gen.id}
                      >
                        {loadingView === gen.id
                          ? <span className={styles.btnSpinner} />
                          : "Открыть"}
                      </button>
                      )}
                      <div className={styles.cardActionsSecondary}>
                      <button
                        className={styles.downloadBtn}
                        onClick={async (e) => {
                          e.stopPropagation();
                          setDownloading(gen.id);
                          try {
                            const res  = await fetch(`/api/generations/${gen.id}`);
                            const data = await res.json();
                            const result: ReferatResult = data.result;
                            const docxRes = await fetch("/api/download", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                ...result,
                                _activity: {
                                  action: "DOCX_DOWNLOAD",
                                  source: "dashboard",
                                  generationId: gen.id,
                                  slug: gen.slug,
                                  workType: gen.workType,
                                },
                              }),
                            });
                            if (!docxRes.ok) throw new Error();
                            const blob = await docxRes.blob();
                            const url  = window.URL.createObjectURL(blob);
                            const a    = document.createElement("a");
                            a.href     = url;
                            a.download = `${result.title.replace(/[«»:]/g, "").trim()}.docx`;
                            document.body.appendChild(a); a.click(); a.remove();
                            window.URL.revokeObjectURL(url);
                          } catch { alert("Файл пока не готов. Нажмите «Проверить» и попробуйте снова."); }
                          finally { setDownloading(null); }
                        }}
                        disabled={!isCompleted || downloading === gen.id}
                      >
                        {downloading === gen.id
                          ? <span className={styles.btnSpinner} />
                          : "⬇ DOCX"}
                      </button>
                      {gen.slug && (
                        <div className={styles.shareWrap}>
                          <button
                            className={styles.shareBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(`${window.location.origin}/preview/${gen.slug}`);
                              setCopiedId(gen.id);
                              setTimeout(() => setCopiedId(null), 2000);
                            }}
                            title="Поделиться"
                          >
                            🔗
                          </button>
                          {copiedId === gen.id && (
                            <span className={styles.copiedTooltip}>Скопировано</span>
                          )}
                        </div>
                      )}
                      {(user as typeof user & { role?: string })?.role === "admin" && (
                        <button
                          className={styles.deleteBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(gen.id);
                          }}
                          disabled={deleting === gen.id}
                        >
                          {deleting === gen.id ? <span className={styles.btnSpinner} /> : "✕"}
                        </button>
                      )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* ── DOCX-МОДАЛ (portal) ── */}
      {viewingGen && createPortal((
        <div
          className={`${styles.docModalOverlay} ${viewingClosing ? styles.docModalOverlayClosing : ""}`}
          onClick={e => { if (e.target === e.currentTarget) closeViewer(); }}
        >
          <div
            ref={viewerModalRef}
            className={`${styles.docModalBox} ${viewingClosing ? styles.docModalBoxClosing : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-doc-modal-title"
          >

            {/* Крестик — только на десктопе */}
            <button ref={viewerCloseRef} className={styles.docModalClose} onClick={closeViewer}>✕</button>

            {/* Мобильная шапка */}
            <div className={styles.docMobileHeader}>
              <div>
                <h2 id="dashboard-doc-modal-title" className={styles.docModalTitle}>{viewingGen.result.title}</h2>
                <div className={styles.docModalBadges}>
                  <span className={styles.docBadge}>{viewingGen.workType}</span>
                  <span className={styles.docBadge}>{viewingGen.pages} стр.</span>
                </div>
              </div>
              <button className={styles.docMobileCloseBtn} onClick={closeViewer}>✕</button>
            </div>

            {/* Табы */}
            <div className={styles.docTabs}>
              <button type="button" className={`${styles.docTab} ${modalTab === "work" ? styles.docTabActive : ""}`}
                onClick={() => setModalTab("work")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/docx-icon.png" alt="" className={styles.docTabIcon} />
                Работа
              </button>
              {dashHasPresentationTab && (
                <button type="button" className={`${styles.docTab} ${modalTab === "presentation" ? styles.docTabActive : ""}`}
                  onClick={() => setModalTab("presentation")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/pptx-icon.svg" alt="" className={styles.docTabIcon} />
                  Презентация
                </button>
              )}
            </div>

            <div className={styles.docModalBody}>

            {/* Левый столбец */}
            <div className={styles.docModalLeft} style={modalTab === "presentation" ? { background: "#ececf3" } : undefined}>
              {/* DOCX preview — всегда в DOM, скрыт через CSS при табе Презентация */}
              <div style={{ display: modalTab === "work" ? "block" : "none" }}>
                {previewLoading && (
                  <div className={styles.docPreviewSpinner}>
                    <span className={styles.docSpinner} /> Загружаем предпросмотр...
                  </div>
                )}
                <div ref={previewContainerRef} className={styles.docPreviewContainer} />
              </div>
              {/* Ion-превью — скрыто при табе Работа */}
              {dashHasPresentationTab && (
              <div
                style={{
                  display: modalTab === "presentation" ? "flex" : "none",
                  flex: 1,
                  minHeight: 0,
                  width: "100%",
                  flexDirection: "column",
                  position: "relative",
                }}
              >
                {hasPresSlides ? (
                  <IonPresentationPreview slides={presSlides ?? []} />
                ) : (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "#5c4d66", textAlign: "center", padding: 24 }}>
                    <p style={{ margin: 0, fontSize: 14, fontFamily: "\"Golos Text\", -apple-system, sans-serif", maxWidth: 420, lineHeight: 1.5 }}>
                      Предпросмотр слайдов недоступен. Скачайте готовый PPTX — файл собран по шаблону Ion.
                    </p>
                    <button
                      type="button"
                      className={styles.dashPresentationHeroPayBtn}
                      onClick={() => handleDownloadExtra("presentation")}
                    >
                      Скачать PPTX
                    </button>
                  </div>
                )}
                {dashExtrasBusy && (
                  <div
                    style={{
                      position: "absolute",
                      inset:            0,
                      background:       "rgba(236, 236, 243, 0.96)",
                      display:          "flex",
                      flexDirection:    "column",
                      alignItems:       "center",
                      justifyContent:   "center",
                      gap:              14,
                      zIndex:           6,
                      padding:          24,
                      textAlign:        "center",
                    }}
                  >
                    <span style={{ color: "#4a1942", fontSize: 14, marginBottom: 6 }}>
                      Создаём материалы…
                    </span>
                    <div style={{ width: "82%", maxWidth: 340, height: 8, background: "#2d3748", borderRadius: 4, overflow: "hidden" }}>
                      <div
                        style={{
                          height:           "100%",
                          width:            `${dashExtrasProgress}%`,
                          background:       "linear-gradient(90deg, #1e3a5f, #d97706)",
                          borderRadius:     4,
                          transition:       "width 0.35s ease",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>

            {/* Правый столбец — десктоп */}
            <div className={styles.docModalRight}>
              <h2 className={styles.docModalTitle}>{viewingGen.result.title}</h2>
              <div className={styles.docModalBadges}>
                <span className={styles.docBadge}>{viewingGen.workType}</span>
                <span className={styles.docBadge}>{viewingGen.pages} стр.</span>
              </div>
              <hr className={styles.docDivider} />

              {/* Скачать DOCX / PPTX в зависимости от таба */}
              {modalTab === "presentation" && dashHasPresentationTab ? (
                <button className={styles.docDownloadBtn} onClick={() => handleDownloadExtra("presentation")}
                  disabled={downloadingPptx}
                  style={{ background: downloadingPptx ? "#374151" : "#1E3A5F", color: "#fff" }}>
                  {downloadingPptx
                    ? <><span className={styles.docBtnSpinner} />Генерируем файл...</>
                    : <><img src="/pptx-icon.svg" alt="" className={styles.docDownloadIcon} />Скачать PPTX</>}
                </button>
              ) : (
                <button
                  className={styles.docDownloadBtn}
                  onClick={() => handleDownloadDocx()}
                  disabled={downloading === "viewer"}
                >
                  {downloading === "viewer"
                    ? <><span className={styles.docBtnSpinner} />Создаём...</>
                    : <><img src="/docx-icon.png" alt="" className={styles.docDownloadIcon} />Скачать DOCX</>}
                </button>
              )}

              {/* Заказ доп. материалов к уже сохранённой работе */}
              {dashShowExtrasOrder && (
                <>
                  <hr className={styles.docDivider} />
                  <p className={styles.docExtrasHeading}>Добавить материалы</p>
                  {dashExtrasBusy ? (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: 8 }}>Генерируем… {dashExtrasProgress}%</div>
                      <div style={{ width: "100%", height: 7, background: "#E2E8F0", borderRadius: 4, overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${dashExtrasProgress}%`,
                            background: "linear-gradient(90deg, #1e3a5f, #d97706)",
                            borderRadius: 4,
                            transition: "width 0.35s ease",
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className={styles.dashExtrasToggles}>
                      {dashCanOrderPres && (
                        <label className={styles.dashExtrasToggleRow}>
                          <input
                            type="checkbox"
                            className={styles.dashExtrasToggleInput}
                            checked={dashPresSel}
                            onChange={e => setDashPresSel(e.target.checked)}
                          />
                          <span className={styles.dashExtrasToggleSlider} />
                          <span className={styles.dashExtrasToggleLabel}>
                            <img src="/pptx-icon.svg" alt="" className={styles.dashExtrasToggleIcon} />
                            Презентация
                          </span>
                          <span className={styles.dashExtrasTogglePrice}>+199 ₽</span>
                        </label>
                      )}
                      {dashCanOrderSpeech && (
                        <label className={styles.dashExtrasToggleRow}>
                          <input
                            type="checkbox"
                            className={styles.dashExtrasToggleInput}
                            checked={dashSpeechSel}
                            onChange={e => setDashSpeechSel(e.target.checked)}
                          />
                          <span className={styles.dashExtrasToggleSlider} />
                          <span className={styles.dashExtrasToggleLabel}>
                            <img src="/txt-icon.svg" alt="" className={styles.dashExtrasToggleIcon} />
                            Текст выступления
                          </span>
                          <span className={styles.dashExtrasTogglePrice}>+149 ₽</span>
                        </label>
                      )}
                      {dashExtrasTotal > 0 && (
                        <button type="button" className={styles.dashExtrasPayBtn} onClick={handleDashboardExtrasPayment}>
                          Оплатить {dashExtrasTotal} ₽
                        </button>
                      )}
                    </div>
                  )}
                  {dashExtrasErr && (
                    <p className={styles.dashExtrasError}>{dashExtrasErr}</p>
                  )}
                </>
              )}

              {/* Дополнительные материалы — только выступление, PPTX скачивается большой кнопкой */}
              {viewingGen.extras?.speech && (
                <>
                  <hr className={styles.docDivider} />
                  <p className={styles.docExtrasHeading}>Дополнительные материалы</p>
                  <div className={styles.docExtrasDownloads}>
                    <button
                      className={styles.docExtrasDownloadBtn}
                      onClick={() => handleDownloadExtra("speech")}
                    >
                      <img src="/txt-icon.svg" alt="" className={styles.docDownloadIcon} />
                      Выступление .txt
                    </button>
                  </div>
                </>
              )}

              {viewingGen.slug && (
                <>
                  <hr className={styles.docDivider} />
                  <button
                    className={styles.docShareBtn}
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/preview/${viewingGen.slug}`);
                    }}
                  >
                    🔗 Скопировать ссылку
                  </button>
                </>
              )}

              {TITLE_PAGE_TYPES.includes(viewingGen.workType) && (
                <>
                  <hr className={styles.docDivider} />
                  <div className={styles.docTitleSection}>
                    <p className={styles.docTitleHeading}>Данные для документов</p>
                    <p className={styles.docTitleSub}>Подставляются в работу и презентацию</p>
                    <input className={styles.docTitleInput} placeholder="ФИО студента" value={titleForm.fullName} onChange={e => setTitleForm(prev => ({ ...prev, fullName: e.target.value }))} />
                    <input className={styles.docTitleInput} placeholder="Университет" value={titleForm.university} onChange={e => setTitleForm(prev => ({ ...prev, university: e.target.value }))} />
                    <label className={styles.docSkipRow}>
                      <input type="checkbox" checked={skipFaculty} onChange={e => setSkipFaculty(e.target.checked)} />
                      <span>Не указывать факультет</span>
                    </label>
                    {!skipFaculty && <input className={styles.docTitleInput} placeholder="Направление / факультет" value={titleForm.faculty} onChange={e => setTitleForm(prev => ({ ...prev, faculty: e.target.value }))} />}
                    <label className={styles.docSkipRow}>
                      <input type="checkbox" checked={skipSpeciality} onChange={e => setSkipSpeciality(e.target.checked)} />
                      <span>Не указывать специализацию</span>
                    </label>
                    {!skipSpeciality && <input className={styles.docTitleInput} placeholder="Специализация" value={titleForm.speciality} onChange={e => setTitleForm(prev => ({ ...prev, speciality: e.target.value }))} />}
                    <label className={styles.docSkipRow}>
                      <input type="checkbox" checked={skipDiscipline} onChange={e => setSkipDiscipline(e.target.checked)} />
                      <span>Не указывать предмет</span>
                    </label>
                    {!skipDiscipline && <input className={styles.docTitleInput} placeholder="Предмет / дисциплина" value={titleForm.discipline} onChange={e => setTitleForm(prev => ({ ...prev, discipline: e.target.value }))} />}
                    <input className={styles.docTitleInput} placeholder="Кафедра" value={titleForm.department} onChange={e => setTitleForm(prev => ({ ...prev, department: e.target.value }))} />
                    <input className={styles.docTitleInput} placeholder="Группа" value={titleForm.groupNumber} onChange={e => setTitleForm(prev => ({ ...prev, groupNumber: e.target.value }))} />
                    <input className={styles.docTitleInput} placeholder="Научный руководитель" value={titleForm.teacherName} onChange={e => setTitleForm(prev => ({ ...prev, teacherName: e.target.value }))} />
                    <input className={styles.docTitleInput} placeholder="Город" value={titleForm.city} onChange={e => setTitleForm(prev => ({ ...prev, city: e.target.value }))} />
                    <button className={styles.docUpdateBtn} onClick={handleTitleUpdate} disabled={titleUpdating}>
                      {titleUpdating ? "Обновляем..." : "↻ Обновить документ"}
                    </button>
                    <label className={styles.docSaveProfileRow}>
                      <input
                        type="checkbox"
                        className={styles.docSaveProfileCheck}
                        checked={saveProfile}
                        onChange={e => setSaveProfile(e.target.checked)}
                      />
                      <span>Запомнить данные</span>
                    </label>
                  </div>
                </>
              )}
            </div>

            </div>{/* /docModalBody */}

            {/* Мобильная нижняя панель */}
            <div className={styles.docMobileBottom}>
              {!previewLoading && modalTab === "work" && (
                <div className={styles.docMobileZoomRow}>
                  <button className={styles.docMobileZoomBtn} onClick={() => applyZoom(0.1)}>＋</button>
                  <span className={styles.docMobileZoomLabel}>{Math.round(baseScaleRef.current * previewZoom * 100)}%</span>
                  <button className={styles.docMobileZoomBtn} onClick={() => applyZoom(-0.1)}>－</button>
                </div>
              )}
              {modalTab === "presentation" && dashHasPresentationTab ? (
                <button
                  className={styles.docDownloadBtn}
                  onClick={() => handleDownloadExtra("presentation")}
                  disabled={downloadingPptx}
                  style={{ background: downloadingPptx ? "#374151" : "#1E3A5F", color: "#fff" }}
                >
                  {downloadingPptx
                    ? <><span className={styles.docBtnSpinner} />Генерируем файл...</>
                    : <><img src="/pptx-icon.svg" alt="" className={styles.docDownloadIcon} />Скачать PPTX</>}
                </button>
              ) : (
                <button
                  className={styles.docDownloadBtn}
                  onClick={() => handleDownloadDocx()}
                  disabled={downloading === "viewer"}
                >
                  {downloading === "viewer"
                    ? <><span className={styles.docBtnSpinner} />Создаём...</>
                    : <><img src="/docx-icon.png" alt="" className={styles.docDownloadIcon} />Скачать DOCX</>}
                </button>
              )}
              {viewingGen.extras?.speech && (
                <div className={styles.docExtrasDownloadsMobile}>
                  <button className={styles.docExtrasDownloadBtnSmall} onClick={() => handleDownloadExtra("speech")}>
                    <img src="/txt-icon.svg" alt="" className={styles.docDownloadIcon} />
                    Выступление .txt
                  </button>
                </div>
              )}
              {dashShowExtrasOrder && (
                <>
                  {dashExtrasBusy ? (
                    <div className={styles.dashMobileExtrasProgress}>
                      <span>Создаём материалы… {dashExtrasProgress}%</span>
                      <div className={styles.dashMobileExtrasBarOuter}>
                        <div className={styles.dashMobileExtrasBarInner} style={{ width: `${dashExtrasProgress}%` }} />
                      </div>
                    </div>
                  ) : (
                    <>
                      {modalTab === "work" && (
                        <div className={styles.dashExtrasMobileGrid}>
                          {dashCanOrderPres && (
                            <label className={`${styles.dashExtrasMobileChip} ${dashPresSel ? styles.dashExtrasMobileChipOn : ""}`}>
                              <input
                                type="checkbox"
                                className={styles.dashExtrasToggleInput}
                                checked={dashPresSel}
                                onChange={e => setDashPresSel(e.target.checked)}
                              />
                              <img src="/pptx-icon.svg" alt="" className={styles.dashExtrasMobileChipIcon} />
                              <span>Презентация</span>
                              <span className={styles.dashExtrasMobileChipPrice}>+199</span>
                            </label>
                          )}
                          {dashCanOrderSpeech && (
                            <label className={`${styles.dashExtrasMobileChip} ${dashSpeechSel ? styles.dashExtrasMobileChipOn : ""}`}>
                              <input
                                type="checkbox"
                                className={styles.dashExtrasToggleInput}
                                checked={dashSpeechSel}
                                onChange={e => setDashSpeechSel(e.target.checked)}
                              />
                              <img src="/txt-icon.svg" alt="" className={styles.dashExtrasMobileChipIcon} />
                              <span>Выступление</span>
                              <span className={styles.dashExtrasMobileChipPrice}>+149</span>
                            </label>
                          )}
                        </div>
                      )}
                      {modalTab === "work" && dashExtrasTotal > 0 && (
                        <button type="button" className={`${styles.dashExtrasPayBtnWide} ${styles.dashExtrasPayBtnWideBlue}`} onClick={handleDashboardExtrasPayment}>
                          Оплатить {dashExtrasTotal} ₽
                        </button>
                      )}
                    </>
                  )}
                  {dashExtrasErr && <p className={styles.dashExtrasErrorMobile}>{dashExtrasErr}</p>}
                </>
              )}
              {TITLE_PAGE_TYPES.includes(viewingGen.workType) && (
                <button className={styles.docMobileTitleBtn} onClick={() => setShowMobileTitleForm(true)}>
                  Данные для документов
                </button>
              )}
            </div>

          {/* Мобильная форма титульника — оверлей поверх модала */}
          {showMobileTitleForm && TITLE_PAGE_TYPES.includes(viewingGen.workType) && (
            <div className={styles.docMobileTitleOverlay}>
              <div className={styles.docMobileTitleSheetHeader}>
                <div>
                  <p className={styles.docTitleHeading}>Данные для документов</p>
                  <p className={styles.docTitleSub}>Подставляются в работу и презентацию</p>
                </div>
                <button className={styles.docMobileTitleSheetClose} onClick={() => setShowMobileTitleForm(false)}>✕</button>
              </div>
              <div className={styles.docMobileTitleSheetBody}>
                <input className={styles.docTitleInput} placeholder="ФИО студента" value={titleForm.fullName} onChange={e => setTitleForm(prev => ({ ...prev, fullName: e.target.value }))} />
                <input className={styles.docTitleInput} placeholder="Университет" value={titleForm.university} onChange={e => setTitleForm(prev => ({ ...prev, university: e.target.value }))} />
                <label className={styles.docSkipRow}>
                  <input type="checkbox" checked={skipFaculty} onChange={e => setSkipFaculty(e.target.checked)} />
                  <span>Не указывать факультет</span>
                </label>
                {!skipFaculty && <input className={styles.docTitleInput} placeholder="Направление / факультет" value={titleForm.faculty} onChange={e => setTitleForm(prev => ({ ...prev, faculty: e.target.value }))} />}
                <label className={styles.docSkipRow}>
                  <input type="checkbox" checked={skipSpeciality} onChange={e => setSkipSpeciality(e.target.checked)} />
                  <span>Не указывать специализацию</span>
                </label>
                {!skipSpeciality && <input className={styles.docTitleInput} placeholder="Специализация" value={titleForm.speciality} onChange={e => setTitleForm(prev => ({ ...prev, speciality: e.target.value }))} />}
                <label className={styles.docSkipRow}>
                  <input type="checkbox" checked={skipDiscipline} onChange={e => setSkipDiscipline(e.target.checked)} />
                  <span>Не указывать предмет</span>
                </label>
                {!skipDiscipline && <input className={styles.docTitleInput} placeholder="Предмет / дисциплина" value={titleForm.discipline} onChange={e => setTitleForm(prev => ({ ...prev, discipline: e.target.value }))} />}
                <input className={styles.docTitleInput} placeholder="Кафедра" value={titleForm.department} onChange={e => setTitleForm(prev => ({ ...prev, department: e.target.value }))} />
                <input className={styles.docTitleInput} placeholder="Группа" value={titleForm.groupNumber} onChange={e => setTitleForm(prev => ({ ...prev, groupNumber: e.target.value }))} />
                <input className={styles.docTitleInput} placeholder="Научный руководитель" value={titleForm.teacherName} onChange={e => setTitleForm(prev => ({ ...prev, teacherName: e.target.value }))} />
                <input className={styles.docTitleInput} placeholder="Город" value={titleForm.city} onChange={e => setTitleForm(prev => ({ ...prev, city: e.target.value }))} />
                <button className={styles.docUpdateBtn} onClick={async () => { await handleTitleUpdate(); setShowMobileTitleForm(false); }} disabled={titleUpdating}>
                  {titleUpdating ? "Обновляем..." : "↻ Обновить документ"}
                </button>
                <label className={styles.docSaveProfileRow}>
                  <input type="checkbox" className={styles.docSaveProfileCheck} checked={saveProfile} onChange={e => setSaveProfile(e.target.checked)} />
                  <span>Запомнить данные</span>
                </label>
              </div>
            </div>
          )}

          </div>
        </div>
      ), document.body)}

      {/* ── Feedback modal (bad rating from email) ──────────────────── */}
      {feedbackOpen && createPortal(
        <div
          onClick={() => !feedbackDone && setFeedbackOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(6,21,37,0.85)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#0B1829", borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.08)",
              padding: "36px 40px", maxWidth: 480, width: "100%",
              position: "relative",
            }}
          >
            {!feedbackDone ? (
              <>
                <button
                  onClick={() => setFeedbackOpen(false)}
                  style={{
                    position: "absolute", top: 16, right: 16,
                    background: "none", border: "none", cursor: "pointer",
                    color: "#64748B", fontSize: 20, lineHeight: 1, padding: 4,
                  }}
                  aria-label="Закрыть"
                >✕</button>

                <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
                  Что пошло не так?
                </h2>
                <p style={{ color: "#64748B", fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 }}>
                  Расскажите — мы используем это для улучшения качества генерации.
                </p>

                {/* Чекбоксы */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                  {FEEDBACK_ISSUES.map(issue => (
                    <label
                      key={issue}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        cursor: "pointer", color: "#CBD5E1", fontSize: 15,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={feedbackIssues.includes(issue)}
                        onChange={e => setFeedbackIssues(prev =>
                          e.target.checked ? [...prev, issue] : prev.filter(i => i !== issue)
                        )}
                        style={{ width: 16, height: 16, accentColor: "#C9962A", cursor: "pointer" }}
                      />
                      {issue}
                    </label>
                  ))}
                </div>

                {/* Комментарий */}
                <textarea
                  placeholder="Дополнительный комментарий (необязательно)"
                  value={feedbackComment}
                  onChange={e => setFeedbackComment(e.target.value)}
                  rows={3}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 10, color: "#CBD5E1", fontSize: 14,
                    padding: "12px 14px", resize: "vertical", outline: "none",
                    fontFamily: "inherit", marginBottom: 20,
                  }}
                />

                <button
                  disabled={feedbackSending}
                  onClick={async () => {
                    setFeedbackSending(true);
                    try {
                      await fetch("/api/feedback/comment", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          generationId: feedbackGenId,
                          issues: feedbackIssues,
                          comment: feedbackComment,
                        }),
                      });
                    } finally {
                      setFeedbackSending(false);
                      setFeedbackDone(true);
                    }
                  }}
                  style={{
                    width: "100%", padding: "14px 0",
                    background: "linear-gradient(135deg,#C9962A 0%,#B8851F 100%)",
                    color: "#fff", border: "none", borderRadius: 12,
                    fontSize: 15, fontWeight: 700, cursor: "pointer",
                    opacity: feedbackSending ? 0.7 : 1,
                  }}
                >
                  {feedbackSending ? "Отправляем..." : "Отправить отзыв"}
                </button>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "8px 0" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🙏</div>
                <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
                  Спасибо за отзыв!
                </h2>
                <p style={{ color: "#64748B", fontSize: 14, margin: "0 0 24px" }}>
                  Мы учтём это при следующей генерации.
                </p>
                <button
                  onClick={() => setFeedbackOpen(false)}
                  style={{
                    padding: "12px 32px",
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "#CBD5E1", borderRadius: 10,
                    fontSize: 15, cursor: "pointer",
                  }}
                >
                  Закрыть
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
