import { useEffect, useRef, type ReactNode } from "react";
import { useIsRestoring, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import { StartupRenderContext, StartupReadyContext, useWorkspaceStartup } from "../../hooks/core/use-workspace-startup";
import { useSettings } from "../../hooks/core/use-settings";
import { setDiagnosticsEnabled, setCrashReportsEnabled, trackPerformance } from "../../lib/api/track-event";
import { collectStartupSamples, startupFailureSample, startupMark, startupRoute } from "../../lib/startup-timing";
import { IS_DESKTOP_RUNTIME } from "../../platform/runtime";
import { isWorkspacePath } from "../../lib/auth/workspace-path";
import { Button } from "../primitives/Button";
import { Loading } from "../shared/Loading";

/** Lives above routes so startup completes once per signed-in account. */
export function WorkspaceStartup({ children }: { children: ReactNode }) {
    const { pathname } = useLocation();
    const { authReady, isAuthenticated } = useAuthState();
    const { data: settings } = useSettings();
    const client = useQueryClient();
    const restoring = useIsRestoring();
    const reported = useRef(false);
    const entryRoute = useRef(startupRoute(pathname));
    const cacheClass = useRef<"warm" | "cold" | "unknown">("unknown");
    const reportedFailures = useRef(new Set<string>());
    const { pending, state, slow, retry, trackRender } = useWorkspaceStartup(
        authReady && isAuthenticated && isWorkspacePath(pathname),
    );
    useEffect(() => {
        setDiagnosticsEnabled(Boolean(settings) && settings?.privacy?.usageDiagnostics !== false);
        setCrashReportsEnabled(Boolean(settings) && settings?.privacy?.crashReports !== false);
        // Account changes clear consent in AuthStateProvider. Keep it on a root
        // render failure so the recovery boundary can report that failure.
    }, [settings?.privacy?.usageDiagnostics, settings?.privacy?.crashReports, Boolean(settings)]);

    useEffect(() => {
        if (!authReady || !isAuthenticated || !isWorkspacePath(pathname)) return;
        if (!restoring && cacheClass.current === "unknown") {
            cacheClass.current = client.getQueryCache().getAll().some((q) => q.isActive()
                && ["tasks", "projects", "tags", "inbox", "habits", "subtasks"].includes(String(q.queryKey[0]))
                && q.state.data !== undefined && q.state.dataUpdatedAt < performance.timeOrigin) ? "warm" : "cold";
        }
        if (pending) {
            startupMark("required_data.start");
            startupMark("chunks.start");
            if (settings?.privacy?.usageDiagnostics && (state === "error" || state === "offline") && !reportedFailures.current.has(state)) {
                reportedFailures.current.add(state);
                const sample = startupFailureSample({ route: entryRoute.current, cache: cacheClass.current, platform: IS_DESKTOP_RUNTIME ? "desktop" : "web", viewport: window.innerWidth < 1120 ? "compact" : "wide" }, state === "offline" ? "network_unavailable" : "error");
                if (sample) trackPerformance([sample]);
            }
            return;
        }
        // This effect runs after the inert/hidden wrapper has committed.
        startupMark("reveal.ready");
        if (!settings || settings.privacy.usageDiagnostics === false || reported.current) return;
        reported.current = true;
        startupMark("visible_assets.start");
        startupMark("reveal_frame.start");
        let frame: number;
        let active = true;
        let delivered = false;
        const images = Array.from(document.querySelectorAll<HTMLImageElement>("img"))
            .filter((img) => { const r = img.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0 && r.left < window.innerWidth && r.right > 0; });
        let frameTimer: ReturnType<typeof setTimeout>;
        const frameReady = new Promise<void>((resolve) => {
            frameTimer = setTimeout(resolve, 20_000);
            frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => { startupMark("reveal_frame.ready"); resolve(); }); });
        });
        const assets = Promise.allSettled([
            document.fonts?.ready ?? Promise.resolve(),
            ...images.map((img) => img.decode?.() ?? Promise.resolve()),
        ]);
        let timer: ReturnType<typeof setTimeout>;
        const assetResult = Promise.race([assets, new Promise((resolve) => { timer = setTimeout(() => resolve("timeout"), 20_000); })]).then((result) => {
            clearTimeout(timer);
            if (active) startupMark("visible_assets.ready");
            return result;
        });
        void Promise.all([assetResult, frameReady]).then(([result]) => {
            clearTimeout(frameTimer);
            if (!active) return;
            const samples = collectStartupSamples({ route: entryRoute.current, cache: cacheClass.current, platform: IS_DESKTOP_RUNTIME ? "desktop" : "web", viewport: window.innerWidth < 1120 ? "compact" : "wide" });
            const visible = samples.find((s) => s.phase === "visible_assets");
            if (visible && result === "timeout") visible.outcome = "timeout";
            else if (visible && Array.isArray(result) && result.some((asset) => asset.status === "rejected")) visible.outcome = "error";
            trackPerformance(samples);
            delivered = true;
        });
        return () => { active = false; cancelAnimationFrame(frame); clearTimeout(timer); clearTimeout(frameTimer); if (!delivered) reported.current = false; };
    }, [authReady, isAuthenticated, pending, state, pathname, client, restoring, settings?.privacy?.usageDiagnostics, Boolean(settings)]);
    const message = state === "offline"
        ? "You're offline. Connect to load this workspace."
        : state === "error"
            ? "We couldn't load your workspace. Please try again."
            : slow ? "Your workspace is taking longer than usual to load." : null;

    return (
        <StartupRenderContext value={trackRender}>
          <StartupReadyContext value={!pending && authReady && isAuthenticated}>
            <div inert={pending} aria-hidden={pending || undefined} style={pending ? { visibility: "hidden" } : undefined}>
                {children}
            </div>
            {pending && (
                <Loading title="Preparing your workspace">
                    {message && <p role="status" className="mt-6 max-w-sm px-4 text-sm text-twilight-text-soft">{message}</p>}
                    {(state === "error" || state === "offline") && (
                        <Button variant="secondary" className="mt-4" onClick={retry}>Try again</Button>
                    )}
                    {slow && state !== "error" && state !== "offline" && (
                        <Button variant="secondary" className="mt-4" onClick={() => window.location.reload()}>Reload</Button>
                    )}
                </Loading>
            )}
          </StartupReadyContext>
        </StartupRenderContext>
    );
}
