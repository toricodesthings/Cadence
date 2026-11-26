import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

const WORKSPACE_QUERY_PREFIXES: readonly QueryKey[] = [
    queryKeys.tasks.all,
    queryKeys.notes.search,
    ["subtasks"],
    queryKeys.habits.all,
    queryKeys.projects.all,
    queryKeys.tags.all,
    queryKeys.personalEvents.all,
    queryKeys.inbox.all,
    ["settings"],
    ["inbox_sections"],
    ["sections"],
] as const;

export async function hardRefreshWorkspaceCaches(queryClient: QueryClient) {
    await Promise.all(
        WORKSPACE_QUERY_PREFIXES.map((queryKey) => queryClient.removeQueries({ queryKey, type: "inactive" })),
    );
    await invalidateWorkspaceCaches(queryClient);
}

export async function invalidateWorkspaceCaches(queryClient: QueryClient) {
    await Promise.all(
        WORKSPACE_QUERY_PREFIXES.map((queryKey) => queryClient.invalidateQueries({ queryKey, refetchType: "active" })),
    );
}

export async function cancelWorkspaceQueries(queryClient: QueryClient) {
    await Promise.all(WORKSPACE_QUERY_PREFIXES.map((queryKey) => queryClient.cancelQueries({ queryKey })));
}
