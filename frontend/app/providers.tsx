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
  }, []);

  return (
    <SessionProvider>
      <ChunkLoadRecovery />
      <ModalProvider>{children}</ModalProvider>
    </SessionProvider>
  );
}
