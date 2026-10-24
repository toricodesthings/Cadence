import { useMemo } from "react";
import type { EffortLevel } from "@cadence/contracts/task";
import { projectEffortSuggestion } from "@cadence/domain/effort-evidence";
import { useEffortEvidence } from "./use-effort-guess";
import { today } from "../../lib/utils/user-zone";

/**
 * The Effort suggestion beside a composer's Effort control: from this account's own earlier choices, or nothing.
 * It is a recommendation only; `chosen` (the draft's own Effort: `undefined` untouched, `null` cleared) always wins.
 * Evidence loads once and is reused: not on every keystroke, and never blocking a save. Offline or still loading, there is none.
 */
export function useEffortSuggestion({ title, projectId, chosen, dismissed, literal = false, open = true }: {
    title: string;
    projectId: string | null;
    chosen: EffortLevel | undefined;
    dismissed: boolean;
    literal?: boolean;
    open?: boolean;
}) {
    const { evidence, enabled } = useEffortEvidence(open);
    return useMemo(
        () => projectEffortSuggestion({ title, projectId, evidence, today: today(), chosen, dismissed, literal, enabled, supported: true }),
        [title, projectId, evidence, chosen, dismissed, literal, enabled],
    );
}
