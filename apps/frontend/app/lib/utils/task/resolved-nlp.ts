import type { DateStyle, SourceSurface } from "@cadence/nlp/core";

export const resolvedNlp = (
    rawInput: string,
    sourceSurface: SourceSurface,
    dateStyle: DateStyle,
    dismissedEntityIds: string[],
    userOverrides: Record<string, unknown>,
) => ({
    rawInput,
    sourceSurface,
    dateStyle,
    dismissedEntityIds,
    userOverrides,
    resolved: true,
});
