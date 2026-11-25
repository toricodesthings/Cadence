import type { CSSProperties } from "react";
import { Inbox } from "lucide-react";
import { dayPeriodOf, getTimeBasedGreeting } from "../../lib/constants/greetings";
import { skyWarmth, useWeather } from "../../hooks/environment/use-weather";
import { useMinuteClock } from "../../hooks/ui/use-realtime-clock";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import { useShellMode } from "../../hooks/ui/use-shell-mode";

type SkyStyle = CSSProperties & { "--sky-warmth": string };

/** The greeting, its tinted name, the part of the day, adaptive sky warmth, and weather once in (never a spinner or error). */
function useGreeting() {
    const { session } = useAuthState();
    const { weather, status } = useWeather();
    const now = useMinuteClock();
    const name = session?.user?.name?.trim().split(/\s+/)[0];
    const greeting = getTimeBasedGreeting(now, name);
    // The name always ends the greeting; tint just that.
    const named = Boolean(name && greeting.endsWith(name));
    const text = (
        <>
            {named ? greeting.slice(0, -name!.length) : greeting}
            {named && <span className="text-accent-primary">{name}</span>}
        </>
    );
    const period = dayPeriodOf(now);
    const readyWeather = status === "ready" ? weather : null;
    const warmth = skyWarmth(period, readyWeather);
    const skyStyle: SkyStyle = { "--sky-warmth": `${warmth}%` };
    return { text, period, weather: readyWeather, weatherStatus: status, skyStyle };
}

/**
 * One quiet line over Capture's field (desktop): a greeting and, once it's in, the weather. Quieter than the
 * field's own prompt. Phones drop the condition word; the icon and temperature carry it.
 */
export function CaptureGreeting({ className = "" }: { className?: string }) {
    const { text, weather, skyStyle } = useGreeting();
    return (
        <p
            className={`flex min-w-0 items-center gap-2 text-[13px] leading-5 text-twilight-text-muted ${className}`.trim()}
        >
            <span className="truncate">{text}</span>
            {weather && (
                <span className="inline-flex shrink-0 items-center gap-1.5 animate-in fade-in duration-500 motion-reduce:animate-none">
                    <span aria-hidden="true" className="text-twilight-text-muted/60">
                        ·
                    </span>
                    <weather.icon
                        size={13}
                        strokeWidth={1.75}
                        aria-hidden="true"
                        className="capture-sky-tone"
                        style={skyStyle}
                    />
                    <span className="tabular-nums">{weather.temp}°</span>
                    <span className="sr-only sm:not-sr-only">{weather.condition}</span>
                </span>
            )}
        </p>
    );
}

/**
 * Capture's window: the greeting in display type beside or beneath a soft sky tinted across a continuous
 * theme-adaptive spectrum (accent for hot/sunny/daytime → calm for cold/rainy/night).
 * - `band`: tops a touch feed with new thoughts and scrolls away with it.
 * - `empty`: fills New on touch when only New is empty.
 * - `clear`: Row view's open vertical all-clear empty state (when Capture is completely empty).
 * - `board-clear`: Board view's distinct wide horizontal all-clear state inside a subtle board canvas frame.
 */
export function CaptureWindow({ variant }: { variant: "band" | "empty" | "clear" | "board-clear" }) {
    const { text, period, weather, weatherStatus, skyStyle } = useGreeting();
    const { isPhone } = useShellMode();
    if (variant === "clear" || variant === "board-clear") {
        const boardClear = variant === "board-clear";
        const showSkyWeather = Boolean(weather) || weatherStatus === "loading";
        const clearSky = (
            <div
                data-period={period}
                style={skyStyle}
                className={`capture-sky-tone capture-sky flex shrink-0 flex-col items-center justify-center ${
                    showSkyWeather
                        ? isPhone
                            ? "min-h-30 min-w-30 px-4 py-3"
                            : "min-h-34 min-w-34 px-5 py-3.5"
                        : "size-24"
                }`}
                aria-hidden={!weather}
            >
                {weather ? (
                    <span className="flex flex-col items-center animate-in fade-in duration-500 motion-reduce:animate-none">
                        <weather.icon size={isPhone ? 28 : 32} strokeWidth={1.5} aria-hidden="true" />
                        <span className="mt-1.5 font-display text-[clamp(1.25rem,1.05rem+0.65vw,1.5rem)] font-semibold leading-none tracking-tight tabular-nums text-twilight-text">
                            {weather.temp}°
                        </span>
                        <span className="mt-1 text-[0.8125rem] leading-tight text-twilight-text-soft">
                            {weather.condition}
                        </span>
                    </span>
                ) : weatherStatus === "loading" ? null : (
                    <Inbox size={24} strokeWidth={1.5} aria-hidden="true" className="opacity-85" />
                )}
            </div>
        );
        const heading = (
            <p className="max-w-[24ch] text-balance font-display text-[clamp(1.5rem,1.25rem+0.85vw,1.875rem)] font-semibold leading-[1.2] tracking-tight text-twilight-text">
                {text}
            </p>
        );
        const subtitle = (
            <p className="max-w-[36ch] text-pretty text-sm leading-relaxed text-twilight-text-soft">
                All clear. Add a thought or task whenever you need.
            </p>
        );
        if (boardClear) {
            return (
                <div
                    data-capture-clear="board"
                    className={`surface-card flex min-h-72 flex-1 items-center justify-center rounded-[28px] px-8 py-12 animate-in fade-in duration-300 motion-reduce:animate-none ${
                        isPhone ? "flex-col gap-3 text-center" : "flex-row gap-5 text-left"
                    }`}
                >
                    <div
                        className={`flex min-w-0 flex-col gap-1.5 ${isPhone ? "order-last items-center" : "items-start"}`}
                    >
                        {heading}
                        {subtitle}
                    </div>
                    {clearSky}
                </div>
            );
        }
        return (
            <div
                data-capture-clear="list"
                className={`flex flex-col items-center justify-center gap-3 px-6 text-center animate-in fade-in duration-300 motion-reduce:animate-none ${isPhone ? "py-12" : "py-16"}`}
            >
                {clearSky}
                {heading}
                {subtitle}
            </div>
        );
    }
    const empty = variant === "empty";
    const sky = (
        <div
            data-period={period}
            style={skyStyle}
            className={`capture-sky-tone capture-sky flex shrink-0 flex-col items-center justify-center ${empty ? "size-24" : "size-16"}`}
            aria-hidden={!weather}
        >
            {weather ? (
                <span className="flex flex-col items-center animate-in fade-in duration-500 motion-reduce:animate-none">
                    <weather.icon size={empty ? 26 : 20} strokeWidth={1.6} aria-hidden="true" />
                    <span className="mt-0.5 text-[13px] font-medium tabular-nums text-twilight-text">
                        {weather.temp}°
                    </span>
                    <span className="sr-only">{weather.condition}</span>
                </span>
            ) : null}
        </div>
    );
    if (empty) {
        return (
            <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
                {sky}
                <p className="font-display text-[22px] font-semibold leading-tight tracking-tight text-twilight-text">
                    {text}
                </p>
                <p className="text-sm text-twilight-text-soft">Nothing new. Add a thought whenever you need.</p>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-3 pb-1 pl-1">
            <p className="line-clamp-2 min-w-0 flex-1 font-display text-[22px] font-semibold leading-tight tracking-tight text-twilight-text">
                {text}
            </p>
            {sky}
        </div>
    );
}
