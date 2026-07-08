"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

/*
  A premium right-side slide-over powered by Framer Motion (enter AND exit
  animations, spring easing, backdrop blur). It's intentionally a thin shell —
  the caller composes its own header, tabbed body and sticky footer inside, so
  the same drawer serves the Add panel and the record-details panel.
*/
export function MotionDrawer({
  open,
  onClose,
  children,
  widthClass = "w-[560px]",
  ariaLabel,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  widthClass?: string;
  ariaLabel?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="overlay"
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            className={`fixed right-0 top-0 z-50 flex h-screen max-w-[96vw] flex-col bg-white shadow-2xl dark:bg-slate-900 ${widthClass}`}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40 }}
          >
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
