"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { ToastProvider } from "@/components/ui/Toast";
import { ApiProvider } from "@/lib/api";

export function Providers({ children }: { children: ReactNode }) {
  return (
    // reducedMotion="user": framer-motion drops transform animations when the OS asks for reduced motion.
    <MotionConfig reducedMotion="user">
      <ApiProvider>
        <ToastProvider>{children}</ToastProvider>
      </ApiProvider>
    </MotionConfig>
  );
}
