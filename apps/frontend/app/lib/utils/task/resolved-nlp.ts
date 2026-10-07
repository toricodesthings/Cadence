import type { DateStyle, SourceSurface } from "@cadence/nlp/core";

/** The envelope for a write whose fields the user already chose: the server stores it and does not reinterpret the words. */
export const resolvedNlp = (rawInput: string, sourceSurface: SourceSurface, dateStyle: DateStyle, dismissedEntityIds: string[], userOverrides: Record<string, unknown>) => ({
    rawInput,
    sourceSurface,
    dateStyle,
    dismissedEntityIds,
    userOverrides,
    resolved: true,
});
