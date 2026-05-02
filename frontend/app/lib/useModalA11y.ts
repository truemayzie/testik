"use client";

import { useEffect, useRef, type RefObject } from "react";

type Options = {
  active: boolean;
  containerRef: RefObject<HTMLElement>;
  initialFocusRef?: RefObject<HTMLElement>;
  onClose?: () => void;
};

export function useModalA11y({ active, containerRef, initialFocusRef, onClose }: Options) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;

    const prevFocusedOutside =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    (initialFocusRef?.current ?? containerRef.current)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      const container = containerRef.current;
      if (!container) return;

      const close = onCloseRef.current;
      if (e.key === "Escape" && close) {
        e.preventDefault();
        close();
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
      prevFocusedOutside?.focus();
    };
  }, [active, containerRef, initialFocusRef]);
}
