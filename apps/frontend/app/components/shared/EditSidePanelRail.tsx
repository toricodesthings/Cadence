import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useSettings } from "../../hooks/core/use-settings";
import { ResizableSidePanel } from "./ResizableSidePanel";

/** Keep the rail mounted through its exit, and let its actual width drive layout. */
export function EditSidePanelRail({ children, ariaLabel, width: controlledWidth, onWidthChange, defaultWidth = 320, minWidth = 260, maxWidth = 480 }: {
    children: ReactNode;
    ariaLabel: string;
    width?: number;
    onWidthChange?: (width: number) => void;
    defaultWidth?: number;
    minWidth?: number;
    maxWidth?: number;
}) {
    const [localWidth, setLocalWidth] = useState(defaultWidth);
    const width = controlledWidth ?? localWidth;
    const setWidth = onWidthChange ?? setLocalWidth;
    const prefersReducedMotion = useReducedMotion();
    const { data: settings } = useSettings();
    const motionPreference = settings?.appearance?.motion;
    const reducedMotion = motionPreference === "reduced" || (motionPreference !== "full" && prefersReducedMotion);
    const transition = { duration: reducedMotion ? 0 : 0.26, ease: [0.16, 1, 0.3, 1] as const };
    return (
        <AnimatePresence initial={false}>
            {children ? (
                <motion.div
                    key="edit-side-panel-rail"
                    data-edit-panel-rail
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: width + 4, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={transition}
                    className="flex h-full shrink-0 self-stretch items-stretch overflow-hidden"
                >
                    <motion.div initial={{ x: reducedMotion ? 0 : 24 }} animate={{ x: 0 }} exit={{ x: reducedMotion ? 0 : 24 }} transition={transition} className="flex h-full shrink-0 items-stretch">
                    <ResizableSidePanel width={width} onWidthChange={setWidth} minWidth={minWidth} maxWidth={maxWidth} ariaLabel={ariaLabel}>
                        {children}
                    </ResizableSidePanel>
                    </motion.div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
