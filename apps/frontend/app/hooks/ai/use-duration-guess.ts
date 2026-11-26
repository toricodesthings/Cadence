import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { durationEvidenceRowSchema } from "@cadence/contracts/memory";
import type { Task } from "@cadence/contracts/task";
import { estimateDuration, type DurationEvidence, type DurationGuess } from "@cadence/nlp/duration";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { useSettings } from "../core/use-settings";
import { queryKeys } from "../../lib/api/query-keys";
import { unwrapResponse } from "../../lib/api/helpers";
import { today } from "../../lib/utils/user-zone";
import { parseVirtualHabitId } from "../habits/use-virtual-habit-tasks";

type Guessable = Pick<Task, "id" | "title" | "projectId">;

export const toDurationEvidence = (
    rows: readonly ReturnType<typeof durationEvidenceRowSchema.parse>[],
): DurationEvidence[] =>
    rows.map((r) => ({
        taskId: r.taskId,
        title: r.title,
        projectId: r.projectId,
        series: r.series,
        low: r.lowMinutes,
        high: r.highMinutes,
        anchored: r.anchored,
        day: r.saidOn,
    }));

export function useDurationGuesser(): (task: Guessable) => DurationGuess | null {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    const { data: settings } = useSettings();
    const full = settings?.assistant?.memoryMode === "full";
    const { data } = useQuery({
        queryKey: queryKeys.ai.durationEvidence,
        enabled: full && authReady && isAuthenticated,
        staleTime: 5 * 60_000,
        queryFn: async () =>
            (await unwrapResponse(await client.api.ai.memory["duration-evidence"].$get())).map((r) =>
                durationEvidenceRowSchema.parse(r),
            ),
    });
    const rows = full ? data : undefined;
    const evidence = useMemo(() => toDurationEvidence(rows ?? []), [rows]);
    return useCallback(
        (task) =>
            evidence.length
                ? estimateDuration(
                      {
                          taskId: parseVirtualHabitId(task.id)?.habitId ?? task.id,
                          title: task.title,
                          projectId: task.projectId,
                      },
                      evidence,
                      today(),
                  )
                : null,
        [evidence],
    );
}

export function useDurationGuess(task: Guessable): DurationGuess | null {
    const guess = useDurationGuesser();
    return useMemo(() => guess(task), [guess, task.id, task.title, task.projectId]); // eslint-disable-line react-hooks/exhaustive-deps -- only these fields matter
}
