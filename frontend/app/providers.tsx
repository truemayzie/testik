"use client";

import { SessionProvider } from "next-auth/react";
import { ModalProvider } from "./lib/ModalContext";
import ChunkLoadRecovery from "./components/ChunkLoadRecovery";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ChunkLoadRecovery />
      <ModalProvider>{children}</ModalProvider>
    </SessionProvider>
  );
}
