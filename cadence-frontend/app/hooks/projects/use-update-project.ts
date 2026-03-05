import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { Project } from "../../types/project";
import { toast } from "sonner";

export function useUpdateProject() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            ...updates
        }: { id: string } & Partial<Pick<Project, "name" | "colorAccent" | "emoji">>) => {
            const res = await client.api.projects[":id"].$patch({
                param: { id },
                json: updates,
            });
            return unwrapResponse<Project>(res);
        },

        onMutate: async ({ id, ...updates }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.projects.all });
            const snapshot = queryClient.getQueriesData<Project[]>({ queryKey: queryKeys.projects.all });

            queryClient.setQueriesData<Project[]>(
                { queryKey: queryKeys.projects.all },
                (old) => old?.map((p) => (p.id === id ? { ...p, ...updates } : p)),
            );

            return { snapshot };
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) {
                for (const [key, data] of context.snapshot) {
                    queryClient.setQueryData(key, data);
                }
            }
            toast.error(err.message || "Failed to update project");
        },

        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects.all }),
    });
}
