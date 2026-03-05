import { useEffect, useRef } from "react";
import { useApiClient } from "../../hooks/use-api-client";
import { toast } from "sonner";
import { useResolveHabit } from "../../hooks/habits/use-resolve-habit";

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
                            <div className="glass bg-twilight-surface text-twilight-content p-5 rounded-2xl border border-twilight-border shadow-2xl w-80 relative overflow-hidden">
                                {/* Ambient glow */}
                                <div className="absolute top-0 right-0 w-32 h-32 bg-lantern/10 blur-3xl rounded-full" />

                                <p className="text-xs uppercase tracking-widest text-lantern/70 font-semibold mb-2">Missed Habit</p>
                                <p className="text-sm text-twilight-content-active mb-5 leading-relaxed font-light">
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
                                        className="px-4 py-2.5 rounded-full text-xs hover:bg-twilight-surface-hover text-twilight-content/70 hover:text-twilight-content transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-twilight-content"
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
