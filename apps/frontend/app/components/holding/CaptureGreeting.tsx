import { getTimeBasedGreeting } from "../../lib/constants/greetings";
import { useWeather } from "../../hooks/environment/use-weather";
import { useMinuteClock } from "../../hooks/ui/use-realtime-clock";
import { useAuthState } from "../../hooks/auth/use-auth-state";

/**
 * One quiet line over Capture: a greeting and, once it's in, the weather. Quieter than the field's own
 * prompt, never a spinner or an error. Phones drop the condition word; the icon and temperature carry it.
 */
export function CaptureGreeting({ className = "" }: { className?: string }) {
    const { session } = useAuthState();
    const { weather, status } = useWeather();
    const name = session?.user?.name?.trim().split(/\s+/)[0];
    const greeting = getTimeBasedGreeting(useMinuteClock(), name);
    // The name always ends the greeting; tint just that.
    const named = name && greeting.endsWith(name);

    return (
        <p className={`flex min-w-0 items-center gap-2 text-[13px] leading-5 text-twilight-text-muted ${className}`.trim()}>
            <span className="truncate">
                {named ? greeting.slice(0, -name.length) : greeting}
                {named && <span className="text-accent-primary">{name}</span>}
            </span>
            {status === "ready" && weather && (
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
