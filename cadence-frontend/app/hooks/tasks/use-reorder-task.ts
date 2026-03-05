import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { invalidateTaskCaches } from "./optimistic-helpers";
import type { Task } from "../../types/task";
import { toast } from "sonner";

/** Reorder a task via fractional index — component handles optimistic array reorder */
export function useReorderTask() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            orderIndex,
        }: {
            id: string;
            orderIndex: number;
        }) => {
            const res = await client.api.tasks[":id"].reorder.$patch({
                param: { id },
                json: { orderIndex },
            });
            return unwrapResponse<Task>(res);
        },
        onError: (err) => {
            toast.error(err.message || "Failed to reorder task");
        },
        onSettled: () => invalidateTaskCaches(queryClient),
    });
}
