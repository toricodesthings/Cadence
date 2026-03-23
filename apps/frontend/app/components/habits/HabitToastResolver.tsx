import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { useApiClient } from "../../hooks/auth/use-api-client";
import { useHabitUnresolvedSummary } from "../../hooks/habits/use-habit-unresolved";
import { useSettings } from "../../hooks/core/use-settings";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";

export function HabitToastResolver() {
    const { data } = useHabitUnresolvedSummary();
    const { data: settings } = useSettings();
    const client = useApiClient();
    const queryClient = useQueryClient();
    const shownRef = useRef(false);
    const resolvingRef = useRef(false);

    const bundleEnabled = settings?.notifications?.bundleMissedRoutinePrompts !== false;
    const actionableItems = useMemo(() => {
        if (!Array.isArray(data)) return [];

        const seen = new Set<string>();
        return data.flatMap((habit) =>
            habit.actionableDates.flatMap((targetDate) => {
                const key = `${habit.habitId}:${targetDate}`;
                if (seen.has(key)) return [];
                seen.add(key);
                return [{ habitId: habit.habitId, targetDate }];
            }),
        );
    }, [data]);

    const resolveAll = async () => {
        if (resolvingRef.current || actionableItems.length === 0) return;
        resolvingRef.current = true;

        try {
            await Promise.all(
                actionableItems.map(async ({ habitId, targetDate }) => {
                    const res = await client.api.habits[":id"].resolve.$post({
                        param: { id: habitId },
                        json: { targetDate, status: "COMPLETED" },
                    });
                    return unwrapResponse(res);
                }),
            );

            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.habits.all }),
                queryClient.invalidateQueries({ queryKey: queryKeys.habits.weeklyAll }),
                queryClient.invalidateQueries({ queryKey: queryKeys.habits.unresolved }),
            ]);

            toast.dismiss("habit-unresolved-bundle");
            toast.success(
                actionableItems.length === 1
                    ? "Marked 1 habit check-in complete"
                    : `Marked ${actionableItems.length} habit check-ins complete`,
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to complete all habits";
            toast.error(message);
        } finally {
            resolvingRef.current = false;
        }
    };

    // We only show the bundled toast once per mount
    useEffect(() => {
        if (shownRef.current) return;
        if (!bundleEnabled) return;
        if (!data || !Array.isArray(data) || data.length === 0) return;
        shownRef.current = true;

        const count = data.length;

        toast.custom(
            () => (
                <div className="cadence-toast cadence-toast--info cadence-toast--wide" data-sonner-toast="true">
                    <div className="cadence-toast__icon">
                        <Info size={16} strokeWidth={2} />
                    </div>
                    <div className="cadence-toast__content">
                        <div className="cadence-toast__title">
                            {count === 1
                                ? "1 routine still needs a check-in"
                                : `${count} routines still need a check-in`}
                        </div>
                        <div className="cadence-toast__description">
                            {data.slice(0, 3).map((h: any) => String(h.title)).join(", ") +
                                (count > 3 ? ` +${count - 3} more` : "")}
                        </div>
                        <div className="cadence-toast__buttonRow">
                            <button
                                type="button"
                                onClick={() => toast.dismiss("habit-unresolved-bundle")}
                                className="cadence-toast__cancel"
                            >
                                Dismiss
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    void resolveAll();
                                }}
                                className="cadence-toast__secondaryAction"
                            >
                                Check all
                            </button>
                        </div>
                    </div>
                </div>
            ),
            {
                id: "habit-unresolved-bundle",
                duration: 12000,
            },
        );
    }, [bundleEnabled, data, resolveAll]);

    return null;
}
