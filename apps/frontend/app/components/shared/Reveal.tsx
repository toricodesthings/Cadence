import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { EASE_OUT_EXPO } from "../../lib/constants/motion";

/**
 * Every expand/collapse: height 0 ↔ auto + opacity, 0.2s. Never a bare conditional render.
 * Under reduced motion it switches instantly. Pass `className` for layout (e.g. a negative margin).
 * Reads the Motion setting from `<html data-motion>` (set by the provider) rather than `useReducedMotionSetting`,
 * so it needs no query client and works in any tree.
 */
export function Reveal({ open, children, id, className = "" }: { open: boolean; children: ReactNode; id?: string; className?: string }) {
    const prefersReduced = useReducedMotion();
    const setting = typeof document === "undefined" ? undefined : document.documentElement.dataset.motion;
    const reduced = setting === "reduced" || (setting !== "full" && Boolean(prefersReduced));
    return (
        <AnimatePresence initial={false}>
            {open ? (
                <motion.div
                    id={id}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: reduced ? 0 : 0.2, ease: EASE_OUT_EXPO }}
                    className={`shrink-0 overflow-hidden ${className}`}
                >
                    {children}
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
