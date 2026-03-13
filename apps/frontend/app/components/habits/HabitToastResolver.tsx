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
                        toast.warning("Missed habit", {
                            id: `missed-habit-${String(missedHabit.id ?? missedHabit.title)}`,
                            description: (
                                <>
                                    Did you manage to{" "}
                                    <strong className="font-semibold text-lantern">
                                        {String(missedHabit.title).toLowerCase()}
                                    </strong>{" "}
                                    yesterday?
                                </>
                            ),
                            cancel: {
                                label: "Missed it",
                                onClick: () => undefined,
                            },
                            action: {
                                label: "Yes, I did",
                                onClick: () => undefined,
                            },
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
