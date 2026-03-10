import { useEffect, useRef } from "react";
import { useApiClient } from "../../hooks/use-api-client";
import { toast } from "sonner";

export function HabitToastResolver() {
    const client = useApiClient();
    const fetchedRef = useRef(false);

    useEffect(() => {
        // Run once on mount
        if (fetchedRef.current) return;
        fetchedRef.current = true;

        const fetchUnresolved = async () => {
            try {
                const res = await client.api.habits.unresolved.$get();
                if (!res.ok) return;
                const { data } = await res.json();

                // data could be an array of habits missed yesterday
                if (Array.isArray(data) && data.length > 0) {
                    data.forEach((missedHabit: any) => {
                        toast.custom((t) => (
                            <div className="glass relative w-80 overflow-hidden rounded-2xl border border-twilight-border bg-twilight-surface p-5 text-twilight-text shadow-2xl">
                                {/* Ambient glow */}
                                <div className="absolute top-0 right-0 w-32 h-32 bg-lantern/10 blur-3xl rounded-full" />

                                <p className="text-xs uppercase tracking-widest text-lantern/70 font-semibold mb-2">Missed Habit</p>
                                <p className="mb-5 text-sm leading-relaxed text-twilight-text-soft">
                                    Did you manage to <strong className="font-semibold text-lantern">{missedHabit.title.toLowerCase()}</strong> yesterday?
                                </p>

                                <div className="flex items-center justify-between mt-2">
                                    {/* Action - A true resolve hook would be injected if we wanted db updating here, 
                                        but since we don't have the date of the missed habit here, we just dismiss it. 
                                        A more complete implementation drops the full object. */}
                                    <button
                                        className="bg-lantern/20 text-lantern hover:bg-lantern/30 px-5 py-2.5 rounded-full text-xs font-semibold shadow-lantern transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lantern"
                                        onClick={() => {
                                            toast.dismiss(t);
                                        }}
                                    >
                                        Yes, I did
                                    </button>
                                    <button
                                        className="rounded-full px-4 py-2.5 text-xs text-twilight-text-soft transition-colors hover:bg-twilight-surface-hover hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-twilight-text-soft"
                                        onClick={() => toast.dismiss(t)}
                                    >
                                        Missed it
                                    </button>
                                </div>
                            </div>
                        ), {
                            duration: Number.POSITIVE_INFINITY,
                        });
                    });
                }
            } catch (e) {
                // Ignore silent ambient check
            }
        };

        fetchUnresolved();
    }, [client]);

    return null; // Renders silently high up
}
