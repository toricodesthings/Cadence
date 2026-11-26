import { useMemo } from "react";
import type { EffortLevel } from "@cadence/contracts/task";
import { projectEffortSuggestion } from "@cadence/domain/effort-evidence";
import { useEffortEvidence } from "./use-effort-guess";
import { today } from "../../lib/utils/user-zone";

export function useEffortSuggestion({
    title,
    projectId,
    chosen,
    dismissed,
    literal = false,
    open = true,
}: {
    title: string;
    projectId: string | null;
    chosen: EffortLevel | undefined;
    dismissed: boolean;
    literal?: boolean;
    open?: boolean;
}) {
    const { evidence, enabled } = useEffortEvidence(open);
    return useMemo(
        () =>
            projectEffortSuggestion({
                title,
                projectId,
                evidence,
                today: today(),
                chosen,
                dismissed,
                literal,
                enabled,
                supported: true,
            }),
        [title, projectId, evidence, chosen, dismissed, literal, enabled],
    );
}
