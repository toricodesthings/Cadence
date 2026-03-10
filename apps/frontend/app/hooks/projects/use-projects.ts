import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { Project } from "../../types/project";
import { useAuthState } from "../use-auth-state";

export function useProjects() {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();

    return useQuery({
        queryKey: queryKeys.projects.all,
        enabled: authReady && isAuthenticated,
        queryFn: async () => {
            const res = await client.api.projects.$get();
            return unwrapResponse<Project[]>(res);
        },
    });
}
