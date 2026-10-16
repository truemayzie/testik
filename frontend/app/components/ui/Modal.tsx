"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useModalA11y } from "../../lib/useModalA11y";
import styles from "./Modal.module.css";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Ширина контента (по умолчанию 520px) */
  width?: number | string;
  /** Без отступов внутри — контент сам управляет (документы, превью) */
  flush?: boolean;
  /** aria-label для контейнера, если нет title */
  label?: string;
}

/**
 * Единая модалка дизайн-системы: портал + a11y (Esc, focus-trap)
 * + блокировка скролла фона + единая анимация fade/scale.
 */
export function Modal({ open, onClose, title, children, width, flush, label }: ModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useModalA11y({
    active: open,
    containerRef,
    initialFocusRef: closeBtnRef,
    onClose,
  });

  // Блокировка скролла фона
  useEffect(() => {
    if (!open) return;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        className={[styles.modal, flush ? styles.flush : ""].join(" ")}
        style={width ? { maxWidth: width } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? title}
        tabIndex={-1}
      >
        <div className={styles.head}>
          {title && <h2 className={styles.title}>{title}</h2>}
          <button
            ref={closeBtnRef}
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Закрыть"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
