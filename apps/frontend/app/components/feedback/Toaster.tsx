import { Toaster as SonnerToaster } from "sonner";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

/**
 * Themed Sonner Toaster — styled to match Cadence's twilight design system.
 * Renders `unstyled` toasts with our own glass-surface aesthetic.
 *
 * Colour mapping:
 *   success → feedback-success
 *   error   → feedback-error
 *   info    → moonlit blue
 */
export function Toaster() {
    return (
        <SonnerToaster
            position="bottom-right"
            gap={8}
            toastOptions={{
                unstyled: true,
                classNames: {
                    toast: [
                        "flex items-center gap-3 w-80 p-4 rounded-xl shadow-2xl border",
                        "backdrop-blur-md pointer-events-auto",
                        "font-sans",
                    ].join(" "),
                    title: "text-[13px] leading-snug text-twilight-text-soft",
                    description: "text-[12px] leading-snug text-twilight-text-muted mt-0.5",
                    actionButton:
                        "text-[12px] font-medium px-2.5 py-1 rounded-xl bg-lantern/20 text-lantern hover:bg-lantern/30 transition-colors ml-auto",
                    cancelButton:
                        "text-[12px] font-medium px-2.5 py-1 rounded-xl text-twilight-text-muted hover:text-twilight-text-soft transition-colors",
                    success: "bg-feedback-success/15 border-feedback-success/30",
                    error: "bg-feedback-error/15 border-feedback-error/30",
                    info: "bg-moonlit/15 border-moonlit/30",
                    // Default toast (no variant) uses twilight surface
                    default: "bg-twilight-base/95 border-twilight-border",
                },
            }}
            icons={{
                success: <CheckCircle2 size={16} className="text-feedback-success shrink-0" />,
                error: <AlertCircle size={16} className="text-feedback-error shrink-0" />,
                info: <Info size={16} className="text-moonlit shrink-0" />,
            }}
        />
    );
}
