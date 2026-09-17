import type { ReactNode } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { Tip } from "../primitives/Tooltip";
import { ImmersiveDetailLayout } from "./ImmersiveDetailLayout";
import { Button } from "../primitives/Button";

const ICON_BUTTON = "btn-icon shrink-0 cursor-pointer text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";

/** Common editing surface for task, event and habit details, in the rail or an overlay. */
export function DetailPanelLayout({ children, leading, title, onClose, closeLabel, mode = "peek", onModeChange }: {
    children: ReactNode;
    leading: ReactNode;
    title: string;
    onClose: () => void;
    closeLabel: string;
    mode?: "peek" | "focus";
    onModeChange?: (mode: "peek" | "focus") => void;
}) {
    return (
        <ImmersiveDetailLayout mode={mode} header={(
            <div className="flex h-(--shell-header-h) shrink-0 items-center gap-1 border-b border-twilight-border pl-5 pr-[calc(1rem+var(--rail-toggle-reserve,0px))]">
                {leading}
                <h2 className="ml-2 truncate font-sans text-lg font-semibold tracking-tight text-twilight-text">{title}</h2>
                <div className="min-w-0 flex-1" />
                {onModeChange ? (
                    <Tip label={mode === "focus" ? "Back to split view" : "Expand editor"} side="bottom">
                        <Button variant="ghost" size="icon" type="button" onClick={() => onModeChange(mode === "focus" ? "peek" : "focus")} aria-label={mode === "focus" ? "Back to split view" : "Expand editor"} className={ICON_BUTTON}>
                            {mode === "focus" ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
                        </Button>
                    </Tip>
                ) : null}
                <Tip label={closeLabel} side="bottom">
                    <Button variant="ghost" size="icon" type="button" onClick={onClose} aria-label={closeLabel} className={ICON_BUTTON}>
                        <X size={16} aria-hidden="true" />
                    </Button>
                </Tip>
            </div>
        )}>
            <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-y-auto scrollbar-thin px-5 pb-6 pt-5">
                {children}
            </div>
        </ImmersiveDetailLayout>
    );
}
