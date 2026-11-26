import { useState } from "react";
import type { EffortLevel } from "@cadence/contracts/task";
import { useEffortSuggestion } from "./use-effort-suggestion";

export function useComposerEffort({
    title,
    projectId,
    literal,
    open = true,
}: {
    title: string;
    projectId: string | null;
    literal: boolean;
    open?: boolean;
}) {
    const [effort, setEffort] = useState<EffortLevel>(null);
    const [origin, setOrigin] = useState<"manual" | "accepted" | null>(null);
    const [touched, setTouched] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const suggestion = useEffortSuggestion({
        title,
        projectId,
        chosen: touched ? effort : undefined,
        dismissed,
        literal,
        open,
    });

    const choose = (value: EffortLevel, from: "manual" | "accepted" | null, isTouched: boolean) => {
        setEffort(value);
        setOrigin(from);
        setTouched(isTouched);
    };

    return {
        effort,
        suggestion,
        accepted: effort !== null && origin === "accepted",
        saved: { effort, ...(effort && origin && { effortOrigin: origin }) },
        set: (value: EffortLevel) => choose(value, value ? "manual" : null, true),
        accept: (level: EffortLevel) => choose(level, "accepted", true),
        undoAccept: () => choose(null, null, false),
        dismiss: () => setDismissed(true),
        reset: () => {
            choose(null, null, false);
            setDismissed(false);
        },
    };
}

export type ComposerEffort = ReturnType<typeof useComposerEffort>;
