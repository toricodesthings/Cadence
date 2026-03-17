import type { ReactNode } from "react";

interface ImmersiveDetailLayoutProps {
    header: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    mode?: "peek" | "focus";
    className?: string;
}

/**
 * Shared detail shell for task and habit inspection/editing.
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
                "flex h-full min-h-0 flex-col overflow-hidden bg-twilight-deep",
                mode === "focus" ? "bg-twilight-void/98" : "",
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
                <div className="mobile-sheet-footer shrink-0 border-t border-twilight-border/40 bg-twilight-deep/88 backdrop-blur-xl">
                    {footer}
                </div>
            ) : null}
        </div>
    );
}
