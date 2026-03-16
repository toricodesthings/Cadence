import { LoaderCircle, CircleAlert, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import type { CSSProperties } from "react";
import { Toaster as SonnerToaster } from "sonner";

import { CADENCE_TOAST_DURATION, installCadenceToastTheme } from "../../lib/utils/cadence-toast";

installCadenceToastTheme();

export function Toaster() {
    return (
        <SonnerToaster
            position="bottom-right"
            theme="dark"
            expand={false}
            visibleToasts={5}
            gap={12}
            duration={CADENCE_TOAST_DURATION}
            offset={24}
            mobileOffset={16}
            style={{ "--width": "26.5rem" } as CSSProperties}
            containerAriaLabel="Cadence notifications"
            toastOptions={{
                unstyled: true,
                closeButton: false,
                style: {
                    "--cadence-toast-duration": `${CADENCE_TOAST_DURATION}ms`,
                    "--cadence-toast-progress-opacity": "1",
                } as CSSProperties,
                classNames: {
                    toast: "cadence-toast",
                    icon: "cadence-toast__icon",
                    content: "cadence-toast__content",
                    title: "cadence-toast__title",
                    description: "cadence-toast__description",
                    actionButton: "cadence-toast__action",
                    cancelButton: "cadence-toast__cancel",
                    closeButton: "cadence-toast__close",
                    loader: "cadence-toast__loader",
                    success: "cadence-toast--success",
                    error: "cadence-toast--error",
                    info: "cadence-toast--info",
                    warning: "cadence-toast--warning",
                    loading: "cadence-toast--loading",
                },
            }}
            icons={{
                success: <CheckCircle2 size={16} strokeWidth={2} />,
                error: <CircleAlert size={16} strokeWidth={2} />,
                info: <Info size={16} strokeWidth={2} />,
                warning: <TriangleAlert size={16} strokeWidth={2} />,
                loading: <LoaderCircle size={16} strokeWidth={2} className="animate-spin" />,
                close: <X size={14} strokeWidth={2} />,
            }}
        />
    );
}
