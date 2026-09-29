import type { ReactNode } from "react";
import { motion, type Variants } from "framer-motion";
import { StarField } from "./loading/LoadingSky";

export const EASE = [0.16, 1, 0.3, 1] as const;
export const stagger: Variants = { show: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } } };
export const rise: Variants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/**
 * A standalone page outside the workspace: stars behind one glass card with the
 * diagonal light sweep and the logo on top. Used by consent, sign-in/up, the auth
 * callbacks and the error pages. Give `title` (plus `description`, `actions`) for a
 * message; `children` render below it. Needs no providers, so root errors can use it.
 */
export function CardPage({ title, description, actions, children }: {
    title?: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    children?: ReactNode;
}) {
    return (
        <main className="relative flex min-h-dvh items-center justify-center bg-twilight px-4 py-6 safe-top safe-bottom">
            <StarField className="pointer-events-none fixed inset-0 h-full w-full" />
            <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.6, ease: EASE }}
                className="cadence-diagonal-sheen glass-surface relative w-full max-w-lg rounded-[1.75rem] px-5 py-6 shadow-[0_36px_120px_rgba(0,0,0,0.38)] sm:px-7"
            >
                <img src="/logo.png" alt="Cadence" className="mx-auto mb-4 h-10 w-10 rounded-[0.8rem] object-cover shadow-[0_8px_32px_color-mix(in_srgb,var(--accent-primary)_22%,transparent)]" />
                {title && (
                    <motion.header
                        variants={stagger}
                        initial="hidden"
                        animate="show"
                        className={`flex flex-col items-center text-center ${children ? "mb-5" : ""}`}
                    >
                        <motion.h1 variants={rise} className="font-display text-[1.45rem] font-semibold leading-tight tracking-tight text-twilight-text text-balance">
                            {title}
                        </motion.h1>
                        {description && (
                            <motion.p variants={rise} className="mt-2 max-w-sm text-sm leading-6 text-twilight-text-soft text-pretty">
                                {description}
                            </motion.p>
                        )}
                        {actions && (
                            <motion.div variants={rise} className="mt-5 flex flex-wrap justify-center gap-3">
                                {actions}
                            </motion.div>
                        )}
                    </motion.header>
                )}
                {children}
            </motion.div>
        </main>
    );
}
