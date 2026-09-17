import type { ReactNode } from "react";
import { SIDE_PANEL_SURFACE } from "./side-panel-surface";

interface ImmersiveDetailLayoutProps {
    header: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    mode?: "peek" | "focus";
    className?: string;
}

/**
 * Shared detail shell for task, event and habit inspection/editing.
 * The inner panel owns the header contents; this layout owns the rhythm.
 */
export function ImmersiveDetailLayout({
    header,
    children,
    footer,
    mode = "peek",
    className = "",
}: ImmersiveDetailLayoutProps) {
    return (
        <div
            data-detail-mode={mode}
            className={[
                `photo-shell-surface ${SIDE_PANEL_SURFACE} flex h-full min-h-0 flex-col overflow-hidden`,
                className,
            ].join(" ").trim()}
        >
            <div className="shrink-0">
                {header}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
                {children}
            </div>
            {footer ? (
                <div className="mobile-sheet-footer shrink-0 border-t border-twilight-border/40 bg-panel/88 backdrop-blur-xl">
                    {footer}
                </div>
            ) : null}
        </div>
    );
}
