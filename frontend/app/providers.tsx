"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { ModalProvider } from "./lib/ModalContext";
import ChunkLoadRecovery from "./components/ChunkLoadRecovery";

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    try {
      localStorage.removeItem("refai_gen");
    } catch {
      /* ignore */
    }

    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "IMG" || target.closest("img"))) {
        e.preventDefault();
      }
    };
    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "IMG" || target.closest("img"))) {
        e.preventDefault();
      }
    };

    document.addEventListener("contextmenu", handleContextMenu, { capture: true });
    document.addEventListener("dragstart", handleDragStart, { capture: true });

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu, { capture: true } as EventListenerOptions);
      document.removeEventListener("dragstart", handleDragStart, { capture: true } as EventListenerOptions);
    };
  }, []);

  return (
    <SessionProvider>
      <ChunkLoadRecovery />
      <ModalProvider>{children}</ModalProvider>
    </SessionProvider>
  );
}
