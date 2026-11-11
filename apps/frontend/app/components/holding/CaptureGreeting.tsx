import { dayPeriodOf, getTimeBasedGreeting } from "../../lib/constants/greetings";
import { useWeather } from "../../hooks/environment/use-weather";
import { useMinuteClock } from "../../hooks/ui/use-realtime-clock";
import { useAuthState } from "../../hooks/auth/use-auth-state";

/** The greeting, its tinted name, the part of the day and the weather once it's in (never a spinner or an error). */
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
    return { text, period: dayPeriodOf(now), weather: status === "ready" ? weather : null };
}

/**
 * One quiet line over Capture's field (desktop): a greeting and, once it's in, the weather. Quieter than the
 * field's own prompt. Phones drop the condition word; the icon and temperature carry it.
 */
export function CaptureGreeting({ className = "" }: { className?: string }) {
    const { text, weather } = useGreeting();
    return (
        <p className={`flex min-w-0 items-center gap-2 text-[13px] leading-5 text-twilight-text-muted ${className}`.trim()}>
            <span className="truncate">{text}</span>
            {weather && (
                <span className="inline-flex shrink-0 items-center gap-1.5 animate-in fade-in duration-500">
                    <span aria-hidden="true" className="text-twilight-text-muted/60">·</span>
                    <weather.icon size={13} strokeWidth={1.75} aria-hidden="true" />
                    <span className="tabular-nums">{weather.temp}°</span>
                    <span className="sr-only sm:not-sr-only">{weather.condition}</span>
                </span>
            )}
        </p>
    );
}

/**
 * Capture's window on touch, where there's no field to sit over: the greeting in display type beside a small
 * sky tinted by the part of the day. `band` tops a feed with new thoughts and scrolls away with it; `empty`
 * takes the place of New's empty state, so a calm Capture opens on a hello instead of a blank.
 * No surface and no border, so it never reads as a row or a column.
 */
export function CaptureWindow({ variant }: { variant: "band" | "empty" }) {
    const { text, period, weather } = useGreeting();
    const empty = variant === "empty";
    const sky = (
        <div
            data-period={period}
            className={`capture-sky flex shrink-0 flex-col items-center justify-center ${empty ? "size-24" : "size-16"}`}
            aria-hidden={!weather}
        >
            {weather ? (
                <span className="flex flex-col items-center animate-in fade-in duration-500">
                    <weather.icon size={empty ? 26 : 20} strokeWidth={1.6} aria-hidden="true" />
                    <span className="mt-0.5 text-[13px] font-medium tabular-nums text-twilight-text">{weather.temp}°</span>
                    <span className="sr-only">{weather.condition}</span>
                </span>
            ) : null}
        </div>
    );
    if (empty) {
        return (
            <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
                {sky}
                <p className="font-display text-[22px] font-semibold leading-tight tracking-tight text-twilight-text">{text}</p>
                <p className="text-sm text-twilight-text-soft">Nothing new. Add a thought whenever you need.</p>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-3 pb-1 pl-1">
            <p className="line-clamp-2 min-w-0 flex-1 font-display text-[22px] font-semibold leading-tight tracking-tight text-twilight-text">{text}</p>
            {sky}
        </div>
    );
}
