"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import styles from "./PaymentWidget.module.css";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { YooMoneyCheckoutWidget: any; }
}

interface Props {
  workType: string;
  extras: string[];
  returnUrl: string;
  onSuccess: () => void;
  onClose: () => void;
}

type Screen = "select" | "sbp" | "card";

const SBP_TIMEOUT_SEC = 600; // 10 минут

export default function PaymentWidget({ workType, extras, returnUrl, onSuccess, onClose }: Props) {
  const [mounted, setMounted]           = useState(false);
  const [screen, setScreen]             = useState<Screen>("select");
  const [methodLoading, setMethodLoading] = useState<"sbp" | "card" | null>(null);
  const [error, setError]               = useState("");

  // SBP state
  const [sbpUrl, setSbpUrl]             = useState("");
  const [yokassaPayId, setYokassaPayId] = useState("");
  const [sbpTimer, setSbpTimer]         = useState(SBP_TIMEOUT_SEC);
  const sbpPollRef                      = useRef<ReturnType<typeof setInterval> | null>(null);
  const sbpTimerRef                     = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isMobile, setIsMobile]         = useState(false);

  // Card widget state
  const [cardLoading, setCardLoading]   = useState(true);
  const widgetRef                       = useRef<any>(null);
  const cardInitRef                     = useRef(false);
  const [confirmationToken, setConfirmationToken] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const prevFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
    setIsMobile(window.innerWidth < 768 || /Android|iPhone|iPad/i.test(navigator.userAgent));
  }, []);

  // Чистка при анмаунте
  useEffect(() => {
    return () => {
      sbpPollRef.current && clearInterval(sbpPollRef.current);
      sbpTimerRef.current && clearInterval(sbpTimerRef.current);
      widgetRef.current?.destroy?.();
    };
  }, []);

  // Делаем модалку доступной с клавиатуры: фокус внутрь и возврат фокуса назад.
  useEffect(() => {
    prevFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeBtnRef.current?.focus();
    return () => {
      prevFocusedRef.current?.focus();
    };
  }, []);

  // Escape закрывает модалку, Tab не выходит за её пределы (focus trap).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!modalRef.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Инициализация виджета карты когда экран = "card" и токен получен
  useEffect(() => {
    if (screen !== "card" || !confirmationToken || cardInitRef.current) return;
    cardInitRef.current = true;

    function initWidget() {
      try {
        widgetRef.current = new window.YooMoneyCheckoutWidget({
          confirmation_token: confirmationToken,
          return_url: returnUrl,
          error_callback(err: unknown) {
            console.error("[PaymentWidget] card error:", err);
            setError("Ошибка при загрузке формы оплаты");
            setCardLoading(false);
          },
        });
        widgetRef.current.render("yw-card-container").then(() => setCardLoading(false));
      } catch (e) {
        console.error("[PaymentWidget] card init error:", e);
        setError("Не удалось загрузить форму оплаты");
        setCardLoading(false);
      }
    }

    if (window.YooMoneyCheckoutWidget) {
      initWidget();
    } else {
      const script = document.createElement("script");
      script.src = "https://yookassa.ru/checkout-widget/v1/checkout-widget.js";
      script.onload = initWidget;
      script.onerror = () => { setError("Не удалось загрузить форму оплаты"); setCardLoading(false); };
      document.head.appendChild(script);
    }
  }, [screen, confirmationToken, returnUrl]);

  async function handleSelectMethod(method: "sbp" | "card") {
    setError("");
    setMethodLoading(method);
    try {
      const res = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workType, extras: extras.length > 0 ? extras : undefined, method }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка создания платежа");
        setMethodLoading(null);
        return;
      }

      // Сохраняем paymentId в pendingGeneration
      try {
        const pending = JSON.parse(sessionStorage.getItem("pendingGeneration") || "{}");
        sessionStorage.setItem("pendingGeneration", JSON.stringify({ ...pending, paymentId: data.paymentId }));
      } catch {}

      if (method === "sbp") {
        setSbpUrl(data.confirmationUrl);
        setYokassaPayId(data.yokassaPaymentId);
        setScreen("sbp");
        startSbpPolling(data.yokassaPaymentId);
        startSbpTimer();
      } else {
        setConfirmationToken(data.confirmationToken);
        setScreen("card");
      }
    } catch {
      setError("Не удалось создать платёж");
    }
    setMethodLoading(null);
  }

  function startSbpPolling(payId: string) {
    sbpPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/payment/check?yokassaPaymentId=${payId}`);
        const data = await res.json();
        if (data.status === "succeeded") {
          stopSbp();
          onSuccess();
        } else if (data.status === "canceled") {
          stopSbp();
          setError("Платёж отменён");
          setScreen("select");
        }
      } catch {}
    }, 3000);
  }

  function startSbpTimer() {
    setSbpTimer(SBP_TIMEOUT_SEC);
    sbpTimerRef.current = setInterval(() => {
      setSbpTimer(prev => {
        if (prev <= 1) {
          stopSbp();
          setError("Время ожидания истекло");
          setScreen("select");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function stopSbp() {
    sbpPollRef.current && clearInterval(sbpPollRef.current);
    sbpTimerRef.current && clearInterval(sbpTimerRef.current);
    sbpPollRef.current = null;
    sbpTimerRef.current = null;
  }

  function formatTimer(sec: number) {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function handleClose() {
    stopSbp();
    widgetRef.current?.destroy?.();
    onClose();
  }

  if (!mounted) return null;

  return createPortal(
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
      <div
        ref={modalRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-widget-title"
      >
        <button ref={closeBtnRef} className={styles.closeBtn} onClick={handleClose} aria-label="Закрыть">✕</button>

        {/* ── Экран выбора метода ── */}
        {screen === "select" && (
          <>
            <h2 id="payment-widget-title" className={styles.title}>Оплата заказа</h2>
            <p className={styles.subtitle}>Безопасная оплата через ЮКассу</p>
            {error && <p className={styles.errorBanner}>⚠ {error}</p>}
            <div className={styles.methods}>
              <button
                className={`${styles.method} ${styles.methodSbp}`}
                onClick={() => handleSelectMethod("sbp")}
                disabled={!!methodLoading}
              >
                <div className={styles.methodLeft}>
                  <span className={styles.methodIcon}>
                    <SbpIcon />
                  </span>
                  <div>
                    <span className={styles.methodName}>СБП</span>
                    <span className={styles.methodDesc}>Приложение вашего банка</span>
                  </div>
                </div>
                <div className={styles.methodRight}>
                  {methodLoading === "sbp"
                    ? <span className={styles.methodSpinner} />
                    : <span className={styles.badgeBest}>Лучший способ</span>
                  }
                </div>
              </button>

              <button
                className={`${styles.method} ${styles.methodCard}`}
                onClick={() => handleSelectMethod("card")}
                disabled={!!methodLoading}
              >
                <div className={styles.methodLeft}>
                  <span className={styles.methodIcon}>💳</span>
                  <div>
                    <span className={styles.methodName}>Банковская карта</span>
                    <span className={styles.methodDesc}>SberPay, T‑Pay и другие</span>
                  </div>
                </div>
                <div className={styles.methodRight}>
                  {methodLoading === "card" && <span className={styles.methodSpinner} />}
                </div>
              </button>
            </div>
            <div className={styles.footer}>
              <YookassaBadge />
            </div>
          </>
        )}

        {/* ── Экран СБП QR ── */}
        {screen === "sbp" && (
          <>
            <button className={styles.backBtn} onClick={() => { stopSbp(); setScreen("select"); setError(""); }}>← Назад</button>
            <h2 id="payment-widget-title" className={styles.title}>Оплата через СБП</h2>

            {isMobile ? (
              <div className={styles.sbpMobile}>
                <p className={styles.sbpHint}>Нажмите кнопку — откроется приложение вашего банка</p>
                <a href={sbpUrl} className={styles.sbpOpenBtn} target="_blank" rel="noreferrer">
                  Открыть приложение банка
                </a>
                <p className={styles.sbpMobileNote}>
                  После оплаты вернитесь на эту страницу — генерация запустится автоматически.
                </p>
              </div>
            ) : (
              <div className={styles.sbpQrWrap}>
                <QRCodeSVG
                  value={sbpUrl}
                  size={240}
                  level="M"
                  className={styles.qr}
                />
                <p className={styles.sbpHint}>
                  Отсканируйте QR‑код в мобильном приложении банка или штатной камерой телефона
                </p>
              </div>
            )}

            <div className={styles.sbpTimer}>
              <span className={styles.sbpTimerDot} />
              Ожидаем оплату <strong>{formatTimer(sbpTimer)}</strong>
            </div>
            <p className={styles.sbpFootnote}>
              После успешной оплаты окно закроется автоматически — не перезагружайте страницу
            </p>
            <button className={styles.cancelBtn} onClick={() => { stopSbp(); setScreen("select"); setError(""); }}>
              Отмена
            </button>
          </>
        )}

        {/* ── Экран карты (виджет ЮКассы) ── */}
        {screen === "card" && (
          <>
            <button className={styles.backBtn} onClick={() => { widgetRef.current?.destroy?.(); cardInitRef.current = false; setConfirmationToken(""); setCardLoading(true); setScreen("select"); setError(""); }}>← Назад</button>
            <h2 id="payment-widget-title" className={styles.title}>Оплата картой</h2>
            {cardLoading && !error && (
              <div className={styles.spinnerWrap}>
                <div className={styles.spinner} />
                <span className={styles.spinnerText}>Загружаем форму...</span>
              </div>
            )}
            {error && <p className={styles.errorBanner}>⚠ {error}</p>}
            <div id="yw-card-container" className={styles.widgetContainer} />
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

function SbpIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#1DB954"/>
      <path d="M7 12.5L10.5 16L17 8" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function YookassaBadge() {
  return (
    <div className={styles.yookassaBadge}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L4 7v5c0 5.25 3.4 10.15 8 11.35C16.6 22.15 20 17.25 20 12V7l-8-5z" fill="#6366f1" fillOpacity=".15" stroke="#6366f1" strokeWidth="1.5"/>
        <path d="M9 12l2 2 4-4" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span>Безопасная оплата · ЮКасса</span>
    </div>
  );
}
