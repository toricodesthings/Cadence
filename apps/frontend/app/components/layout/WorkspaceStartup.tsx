import { useEffect, useRef, useState, type ReactNode } from "react";
import { useIsRestoring, useQueryClient, type QueryClient } from "@tanstack/react-query";
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

type CacheClass = "warm" | "cold" | "provisional" | "unknown";

function cacheClassOf(client: QueryClient): "warm" | "cold" {
    return client
        .getQueryCache()
        .getAll()
        .some(
            (q) =>
                q.isActive() &&
                ["tasks", "projects", "tags", "inbox", "habits", "subtasks"].includes(String(q.queryKey[0])) &&
                q.state.data !== undefined &&
                q.state.dataUpdatedAt < performance.timeOrigin,
        )
        ? "warm"
        : "cold";
}

function sampleContext(route: ReturnType<typeof startupRoute>, cache: CacheClass) {
    return {
        route,
        cache,
        platform: IS_DESKTOP_RUNTIME ? "desktop" : "web",
        // oxlint-disable-next-line eslint/no-restricted-properties -- telemetry category, not layout
        viewport: window.innerWidth < 1120 ? "compact" : "wide",
    } as const;
}

function isOnScreen(img: HTMLImageElement) {
    const r = img.getBoundingClientRect();
    return (
        r.width > 0 &&
        r.height > 0 &&
        r.top < window.innerHeight &&
        r.bottom > 0 &&
        // oxlint-disable-next-line eslint/no-restricted-properties -- on-screen check, not layout
        r.left < window.innerWidth &&
        r.right > 0
    );
}

function measureReveal(done: (result: "timeout" | PromiseSettledResult<unknown>[]) => void): () => void {
    startupMark("visible_assets.start");
    startupMark("reveal_frame.start");
    let frame = 0;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), 20_000);
    });
    const frameReady = Promise.race([
        new Promise<void>((resolve) => {
            frame = requestAnimationFrame(() => {
                frame = requestAnimationFrame(() => {
                    startupMark("reveal_frame.ready");
                    resolve();
                });
            });
        }),
        timeout,
    ]);
    const assets = Promise.allSettled([
        document.fonts?.ready ?? Promise.resolve(),
        ...Array.from(document.querySelectorAll<HTMLImageElement>("img"))
            .filter(isOnScreen)
            .map((img) => img.decode?.() ?? Promise.resolve()),
    ]);
    const assetResult = Promise.race([assets, timeout]).then((result) => {
        if (active) startupMark("visible_assets.ready");
        return result;
    });
    void Promise.all([assetResult, frameReady]).then(([result]) => {
        clearTimeout(timer);
        if (active) done(result);
    });
    return () => {
        active = false;
        cancelAnimationFrame(frame);
        clearTimeout(timer);
    };
}

type StartupState = ReturnType<typeof useWorkspaceStartup>["state"];

function reportFailureOnce(state: StartupState, reported: Set<string>, context: ReturnType<typeof sampleContext>) {
    if ((state !== "error" && state !== "offline") || reported.has(state)) return;
    reported.add(state);
    const sample = startupFailureSample(context, state === "offline" ? "network_unavailable" : "error");
    if (sample) trackPerformance([sample]);
}

function markAssetsOutcome(
    samples: ReturnType<typeof collectStartupSamples>,
    result: "timeout" | PromiseSettledResult<unknown>[],
) {
    const visible = samples.find((s) => s.phase === "visible_assets");
    if (visible && result === "timeout") visible.outcome = "timeout";
    else if (visible && Array.isArray(result) && result.some((asset) => asset.status === "rejected"))
        visible.outcome = "error";
}

function startupMessage(state: StartupState, slow: boolean) {
    if (state === "offline") return "You're offline. Connect to load this workspace.";
    if (state === "error") return "We couldn't load your workspace. Please try again.";
    return slow ? "Your workspace is taking longer than usual to load." : null;
}

type StartupLoadingProps = { state: StartupState; progress: number; slow: boolean; retry: () => void };

function StartupLoading({ state, progress, slow, retry }: StartupLoadingProps) {
    const message = startupMessage(state, slow);
    const failed = state === "error" || state === "offline";
    return (
        <Loading title="Preparing your workspace" progress={progress}>
            {message && (
                <p role="status" className="mt-6 max-w-sm px-4 text-sm text-twilight-text-soft">
                    {message}
                </p>
            )}
            {failed && (
                <Button variant="secondary" className="mt-4" onClick={retry}>
                    Try again
                </Button>
            )}
            {slow && !failed && (
                <Button variant="secondary" className="mt-4" onClick={() => window.location.reload()}>
                    Reload
                </Button>
            )}
        </Loading>
    );
}

export function WorkspaceStartup({ children }: { children: ReactNode }) {
    const { pathname } = useLocation();
    const { authReady, isAuthenticated, status } = useAuthState();
    const { data: settings } = useSettings();
    const client = useQueryClient();
    const restoring = useIsRestoring();
    const reported = useRef(false);
    const entryRoute = useRef(startupRoute(pathname));
    const cacheClass = useRef<CacheClass>("unknown");
    const reportedFailures = useRef(new Set<string>());
    const { pending, state, progress, slow, retry, trackRender } = useWorkspaceStartup(
        authReady && isAuthenticated && isWorkspacePath(pathname),
        pathname,
    );
    const [revealed, setRevealed] = useState(false);
    useEffect(() => {
        if (pending) return setRevealed(false);
        let frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(() => setRevealed(true));
        });
        return () => cancelAnimationFrame(frame);
    }, [pending]);
    const hidden = pending || !revealed;
    useEffect(() => {
        // oxlint-disable-next-line react/exhaustive-deps -- deps are deliberate here
        setDiagnosticsEnabled(Boolean(settings) && settings?.privacy?.usageDiagnostics !== false);
        setCrashReportsEnabled(Boolean(settings) && settings?.privacy?.crashReports !== false);
        // oxlint-disable-next-line react/exhaustive-deps -- deps are deliberate here
    }, [settings?.privacy?.usageDiagnostics, settings?.privacy?.crashReports, Boolean(settings)]);

    useEffect(() => {
        if (!authReady || !isAuthenticated || !isWorkspacePath(pathname)) return;
        if (!restoring && cacheClass.current === "unknown") cacheClass.current = cacheClassOf(client);
        if (pending) {
            startupMark("required_data.start");
            if (settings?.privacy?.usageDiagnostics)
                reportFailureOnce(
                    state,
                    reportedFailures.current,
                    sampleContext(entryRoute.current, cacheClass.current),
                );
            return;
        }
        if (hidden) return;
        startupMark("reveal.ready");
        if (status === "provisional" && !reported.current) cacheClass.current = "provisional";
        if (!settings || settings.privacy.usageDiagnostics === false || reported.current) return;
        reported.current = true;
        let delivered = false;
        const cancel = measureReveal((result) => {
            const samples = collectStartupSamples(sampleContext(entryRoute.current, cacheClass.current));
            markAssetsOutcome(samples, result);
            trackPerformance(samples);
            delivered = true;
        });
        return () => {
            cancel();
            if (!delivered) reported.current = false;
        };
        // oxlint-disable-next-line react/exhaustive-deps -- deps are deliberate here
    }, [
        authReady,
        isAuthenticated,
        pending,
        hidden,
        state,
        pathname,
        client,
        restoring,
        settings?.privacy?.usageDiagnostics,
        // oxlint-disable-next-line react/exhaustive-deps -- deps are deliberate here
        Boolean(settings),
    ]);
    return (
        <StartupRenderContext value={trackRender}>
            <StartupReadyContext value={!pending && authReady && isAuthenticated}>
                <div
                    inert={hidden}
                    aria-hidden={hidden || undefined}
                    data-startup-hidden={hidden || undefined}
                    style={hidden ? { visibility: "hidden" } : undefined}
                >
                    {children}
                </div>
                {pending && <StartupLoading state={state} progress={progress} slow={slow} retry={retry} />}
            </StartupReadyContext>
        </StartupRenderContext>
    );
}
