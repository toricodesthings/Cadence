import { useCallback, useMemo } from "react";
import { loadShare } from "@cadence/domain/load-share";
import { useAuthState } from "../auth/use-auth-state";
import { useProjects } from "../projects/use-projects";

export function useLoadShare() {
    const { session } = useAuthState();
    const me = session?.user?.id;
    const { data: projects } = useProjects();
    const doers = useMemo(
        () =>
            new Map(
                (projects ?? [])
                    .filter((p) => p.members.length)
                    .map((p) => [p.id, [p.userId, ...p.members.filter((m) => m.role === "edit").map((m) => m.userId)]]),
            ),
        [projects],
    );
    return useCallback(
        (task: { projectId?: string | null; takenBy?: string | null }) => loadShare(task, me, (id) => doers.get(id)),
        [doers, me],
    );
}
