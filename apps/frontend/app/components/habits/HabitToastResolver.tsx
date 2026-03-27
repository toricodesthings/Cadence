import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
    const actionableHabits = useMemo(() => {
        if (!Array.isArray(data)) return [];

        return data.filter((habit) => habit.actionableDates.length > 0);
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

    useEffect(() => {
        if (!bundleEnabled) {
            toast.dismiss("habit-unresolved-bundle");
            shownRef.current = false;
            return;
        }

        if (actionableHabits.length === 0 || actionableItems.length === 0) {
            toast.dismiss("habit-unresolved-bundle");
            shownRef.current = false;
            return;
        }

        if (shownRef.current) return;
        shownRef.current = true;

        const count = actionableHabits.length;
        const missedCheckIns = actionableItems.length;
        const description = actionableHabits.slice(0, 3).map((habit) => habit.title).join(", ");

        toast.info(
            count === 1
                ? "1 routine still needs a check-in"
                : `${count} routines still need a check-in`,
            {
                id: "habit-unresolved-bundle",
                duration: 12000,
                description: description + (count > 3 ? ` +${count - 3} more` : ` · ${missedCheckIns} missed check-in${missedCheckIns === 1 ? "" : "s"}`),
                action: {
                    label: "Check all",
                    onClick: () => {
                        void resolveAll();
                    },
                },
                cancel: {
                    label: "Dismiss",
                    onClick: () => {
                        toast.dismiss("habit-unresolved-bundle");
                    },
                },
            },
        );
    }, [actionableHabits, actionableItems.length, bundleEnabled, resolveAll]);

    return null;
}
