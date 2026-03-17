import { formatDateLabel } from "../../lib/utils/date-format";
import { getTimeBasedGreeting } from "../../lib/utils/greetings";
import { authClient } from "../../lib/auth-client";
import { useWeather } from "../../hooks/environment/use-weather";
import { useRealtimeClock } from "../../hooks/ui/use-realtime-clock";
import { useMemo } from "react";
import { CloudOff } from "lucide-react";

/** The contextual greeting header — warm, cozy, like settling into a lit room */
export function PlannerHeader() {
    const { data: session } = authClient.useSession();
    const { weather, loading, error } = useWeather();
    const now = new Date();
    const formatted = formatDateLabel(now);
    const greeting = useMemo(() => getTimeBasedGreeting(), []);
    const clock = useRealtimeClock();

    const firstName = session?.user?.name?.split(" ")[0] || "Adventurer";

    const WeatherIcon = weather?.icon;

    return (
        <div className="mb-[var(--cadence-planner-gap)] flex items-start justify-between">
            <div>
                {/* Greeting — the warm anchor */}
                <h2 className="font-display text-[2rem] font-semibold tracking-tight text-twilight-text sm:text-[2.15rem]">
                    {greeting}, <span className="text-lantern">{firstName}</span>.
                </h2>

                {/* Date & Weather — quiet, secondary context line */}
                <p className="mt-1.5 text-[14px] tracking-wide text-twilight-text-soft">
                    <span className="first-letter:uppercase">{formatted}</span>
                    <span className="mx-2 text-twilight-text-soft">·</span>
                    <span className="tabular-nums">{clock}</span>

                    {!loading && weather && WeatherIcon && (
                        <span className="animate-in fade-in duration-500">
                            <span className="mx-2 text-twilight-text-soft">·</span>
                            <WeatherIcon size={14} className="inline -mt-0.5 mr-1.5 text-twilight-text-soft" />
                            <span>{weather.temp}°, {weather.condition.toLowerCase()}</span>
                        </span>
                    )}

                    {loading && (
                        <span className="inline-flex items-center ml-3 gap-1.5 animate-pulse">
                            <span className="w-3 h-3 rounded-full bg-twilight-text-muted/15" />
                            <span className="w-12 h-3 rounded bg-twilight-text-muted/15" />
                        </span>
                    )}

                    {!loading && !weather && error && (
                        <span className="animate-in fade-in duration-500">
                            <span className="mx-2 text-twilight-text-soft">·</span>
                            <CloudOff size={13} className="inline -mt-0.5 mr-1 text-twilight-text-muted/70" aria-hidden="true" />
                            <span className="text-twilight-text-muted/70">
                                {error === "denied" ? "Location off" : "Weather unavailable"}
                            </span>
                        </span>
                    )}
                </p>
            </div>
        </div>
    );
}
