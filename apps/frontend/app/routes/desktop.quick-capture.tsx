import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { QuickAddSurface, type QuickAddTab } from "../components/quick-add/QuickAddSurface";
import { closeCurrentDesktopWindow, completeQuickCapture, focusMainDesktopWindow, QUICK_CAPTURE_TAB_EVENT } from "../platform/desktop-shell";
import { useAuthState } from "../hooks/auth/use-auth-state";
import { Loading } from "../components/shared/Loading";
import { IS_DESKTOP_RUNTIME } from "../platform/runtime";

function normalizeQuickAddTab(value: string | null): QuickAddTab {
    return value === "capture" || value === "habit" ? value : "task";
}

export default function DesktopQuickCaptureRoute() {
    const [searchParams] = useSearchParams();
    const [initialTab, setInitialTab] = useState<QuickAddTab>(normalizeQuickAddTab(searchParams.get("tab")));
    const { authReady, isAuthenticated, status } = useAuthState();

    useEffect(() => {
        setInitialTab(normalizeQuickAddTab(searchParams.get("tab")));
    }, [searchParams]);

    useEffect(() => {
        if (!IS_DESKTOP_RUNTIME) {
            return;
        }

        let unlisten: (() => void) | undefined;

        void getCurrentWindow().listen<{ tab?: string }>(QUICK_CAPTURE_TAB_EVENT, (event) => {
            setInitialTab(normalizeQuickAddTab(event.payload?.tab ?? null));
        }).then((dispose) => {
            unlisten = dispose;
        });

        return () => {
            unlisten?.();
        };
    }, []);

    const shellTitle = useMemo(() => {
        if (!isAuthenticated) {
            return "Sign in required";
        }

        return "Quick Capture";
    }, [isAuthenticated]);

    if (!authReady || status === "bootstrapping" || status === "refreshing") {
        return <Loading />;
    }

    if (!isAuthenticated) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-twilight px-6 py-10 text-twilight-text">
                <div className="w-full max-w-md rounded-[2rem] border border-twilight-border bg-twilight-surface/80 p-8 shadow-[0_24px_72px_rgba(0,0,0,0.4)] backdrop-blur-xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-twilight-text-muted">{shellTitle}</p>
                    <h1 className="mt-4 font-display text-3xl text-twilight-text">Cadence needs your main session</h1>
                    <p className="mt-3 text-sm leading-6 text-twilight-text-soft">
                        Quick capture uses the same authenticated workspace as the main Cadence window. Sign in there first, then reopen quick capture.
                    </p>
                    <div className="mt-6 flex gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                void focusMainDesktopWindow();
                            }}
                            className="rounded-xl bg-accent-primary/15 px-4 py-2 text-sm font-medium text-accent-primary transition-colors hover:bg-accent-primary/22"
                        >
                            Focus main window
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                void closeCurrentDesktopWindow();
                            }}
                            className="rounded-xl border border-white/[0.08] px-4 py-2 text-sm text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-twilight px-4 py-6 text-twilight-text">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,192,111,0.14),transparent_30%),linear-gradient(180deg,rgba(25,20,38,0.94),rgba(10,8,16,1))]" />
            <div className="relative z-10 w-full max-w-xl">
                <QuickAddSurface
                    open
                    mode="standalone"
                    initialTab={initialTab}
                    onOpenChange={(open) => {
                        if (!open) {
                            void closeCurrentDesktopWindow();
                        }
                    }}
                    onComplete={(route) => {
                        void completeQuickCapture(route);
                    }}
                />
            </div>
        </main>
    );
}