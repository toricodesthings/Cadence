import type { CanonicalNlpEnvelope, SourceSurface } from "@cadence/nlp/core";

export function buildCanonicalNlpEnvelope(input: {
    rawInput: string;
    sourceSurface: SourceSurface;
    dateStyle: "mdy" | "dmy" | "ymd";
    dismissedEntityIds?: string[];
    userOverrides?: Record<string, unknown>;
}): CanonicalNlpEnvelope {
    return {
        rawInput: input.rawInput,
        sourceSurface: input.sourceSurface,
        dateStyle: input.dateStyle,
        dismissedEntityIds: input.dismissedEntityIds ?? [],
        userOverrides: input.userOverrides ?? {},
    };
}
