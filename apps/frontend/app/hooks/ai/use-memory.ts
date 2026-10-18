/**
 * "What Cadence knows": the memory page, the mode choice, forget / undo / clear.
 * The server owns the mode (POST /ai/memory/mode); the page response is the whole truth,
 * so every mutation writes it back into the cache and nothing is merged client-side.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MEMORY_CONSENT_VERSION, type DurationReport, type DurationReportView, type DurationValue, type MemoryMode, type MemoryPage } from "@cadence/contracts/memory";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { toastError } from "../../lib/utils/error-toast";
import { useSettingsCache } from "../core/use-settings";

export function useMemoryPage(enabled = true) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    return useQuery({
        queryKey: queryKeys.ai.memory,
        enabled: enabled && authReady && isAuthenticated,
        staleTime: 30_000,
        queryFn: async () => unwrapResponse(await client.api.ai.memory.$get()),
    });
}

/** Writes a mutation's page result into the cache, and its mode into settings (what the duration prompt reads). */
function useRefreshPage() {
    const queryClient = useQueryClient();
    const settings = useSettingsCache();
    return (page: MemoryPage) => {
        queryClient.setQueryData(queryKeys.ai.memory, page);
        // Clear or a mode change: what was learned before is not this page's to show.
        queryClient.removeQueries({ queryKey: queryKeys.ai.durationEvidence });
        const current = settings.read();
        if (current) settings.write({ ...current, assistant: { ...current.assistant, memoryMode: page.mode } });
    };
}

export function useSetMemoryMode() {
    const client = useApiClient();
    const refresh = useRefreshPage();
    return useMutation({
        mutationFn: async (mode: MemoryMode) =>
            unwrapResponse(await client.api.ai.memory.mode.$post({ json: { mode, consentVersion: MEMORY_CONSENT_VERSION } })),
        onSuccess: refresh,
        onError: (error) => toastError(error, "Couldn’t change memory"),
    });
}

/** Forget one fact now (Undo within 10 minutes), or `undo: true` to take back a save with no trace. */
export function useForgetMemory() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, undo = false }: { id: string; undo?: boolean }) =>
            unwrapResponse(await client.api.ai.memory[":id"].$delete({ param: { id }, query: { undo: undo ? "true" : "false" } })),
        onMutate: async ({ id }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.ai.memory });
            const before = queryClient.getQueryData<MemoryPage>(queryKeys.ai.memory);
            if (before) queryClient.setQueryData<MemoryPage>(queryKeys.ai.memory, { ...before, facts: before.facts.filter((f) => f.id !== id) });
            return { before };
        },
        onError: (error, _input, context) => {
            if (context?.before) queryClient.setQueryData(queryKeys.ai.memory, context.before);
            toastError(error, "Couldn’t forget that");
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.ai.memory });
            void queryClient.invalidateQueries({ queryKey: queryKeys.ai.durationEvidence }); // a duration fact's answers hide with it
        },
    });
}

export function useRestoreMemory() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => unwrapResponse(await client.api.ai.memory[":id"].restore.$post({ param: { id } })),
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.ai.memory });
            void queryClient.invalidateQueries({ queryKey: queryKeys.ai.durationEvidence }); // a duration fact's answers hide with it
        },
        onError: (error) => toastError(error, "Couldn’t bring that back"),
    });
}

export function useClearMemory() {
    const client = useApiClient();
    const refresh = useRefreshPage();
    return useMutation({
        mutationFn: async (turnOff: boolean) =>
            unwrapResponse(await client.api.ai.memory.$delete({ query: { turnOff: turnOff ? "true" : "false" } })),
        onSuccess: refresh,
        onError: (error) => toastError(error, "Couldn’t clear memory"),
    });
}

/** What the "How long did it take?" toast needs from the server. Quiet: a failure is never worth interrupting for. */
export function useDurationApi() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return {
        ask: async (taskId: string) => unwrapResponse(await client.api.ai.memory.duration.ask.$post({ json: { taskId } })),
        shown: async (token: string) => void unwrapResponse(await client.api.ai.memory.duration.shown.$post({ json: { token } })),
        /** Resolves with what the server stored (null when it stored nothing), and rejects when it couldn't: "Saved" follows only the first. */
        report: async (input: DurationReport) => {
            const view = await unwrapResponse(await client.api.ai.memory.duration.$post({ json: input }));
            // An open Took row shows the same answer the toast just saved.
            if (view) {
                queryClient.setQueryData(queryKeys.ai.duration(input.taskId, view.completedAt), view);
                queryClient.setQueryData(queryKeys.ai.duration(input.taskId), view);
            }
            void queryClient.invalidateQueries({ queryKey: queryKeys.ai.durationEvidence });
            return view;
        },
    };
}

/** The answer behind a done task's "Took 45 min" row; null when there is none (or memory isn't Full). */
export function useReportedDuration(taskId: string, completedAt: string | null | undefined, enabled: boolean) {
    const client = useApiClient();
    return useQuery({
        queryKey: queryKeys.ai.duration(taskId, completedAt),
        enabled,
        staleTime: 30_000,
        queryFn: async () => unwrapResponse(await client.api.ai.memory.duration.$get({ query: { taskId, ...(completedAt && { completedAt }) } })),
    });
}

/**
 * Changes or clears a task's answer from its detail. The row renders the stored view the server returns (`isPending`
 * is "Saving…", `isError` is "Couldn't save · Retry"), never its own draft.
 */
export function useSetReportedDuration(taskId: string, completedAt: string | null | undefined) {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: { value: DurationValue; anchored: boolean } | null): Promise<DurationReportView | null> => {
            if (input === null) {
                unwrapResponse(await client.api.ai.memory.duration.$delete({ json: { taskId, ...(completedAt && { completedAt }) } }));
                return null;
            }
            return unwrapResponse(await client.api.ai.memory.duration.$post({ json: { taskId, ...(completedAt && { completedAt }), ...input } }));
        },
        onSuccess: (view) => {
            queryClient.setQueryData(queryKeys.ai.duration(taskId, completedAt), view);
            void queryClient.invalidateQueries({ queryKey: queryKeys.ai.durationEvidence });
        },
    });
}
