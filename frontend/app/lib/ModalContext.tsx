"use client";

import { createContext, useContext, useState } from "react";

const ModalContext = createContext<{
  isModalOpen: boolean;
  setModalOpen: (v: boolean) => void;
}>({ isModalOpen: false, setModalOpen: () => {} });

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [isModalOpen, setModalOpen] = useState(false);
  return (
    <ModalContext.Provider value={{ isModalOpen, setModalOpen }}>
      {children}
    </ModalContext.Provider>
  );
}

export function useModalContext() {
  return useContext(ModalContext);
}
