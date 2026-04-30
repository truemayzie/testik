"use client";

import { useEffect, type RefObject } from "react";

type Options = {
  active: boolean;
  containerRef: RefObject<HTMLElement>;
  initialFocusRef?: RefObject<HTMLElement>;
  onClose?: () => void;
};

export function useModalA11y({ active, containerRef, initialFocusRef, onClose }: Options) {
  useEffect(() => {
    if (!active) return;

    const prevFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (initialFocusRef?.current ?? containerRef.current)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      const container = containerRef.current;
      if (!container) return;

      if (e.key === "Escape" && onClose) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = container.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;

      if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      prevFocused?.focus();
    };
  }, [active, containerRef, initialFocusRef, onClose]);
}
