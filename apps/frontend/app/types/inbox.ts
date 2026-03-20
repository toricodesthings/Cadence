export type CaptureKind = "task" | "thought" | "reference" | "unknown";
export type CaptureStatus = "clarifying" | "placed" | "kept" | "discarded";

export interface InboxItem {
    id: string;
    userId: string;
    rawText: string;
    sectionId: string | null;
    orderIndex: number;
    processed: boolean;
    captureKind: CaptureKind;
    captureStatus: CaptureStatus;
    placedTaskId: string | null;
    aiSuggestion: string | null;
    analysisStatus: "pending" | "parsed" | "reviewed" | "applied" | null;
    analysisVersion: string | null;
    analysisSummary: string | null;
    analysis: Record<string, unknown> | null;
    sourceSurface: string | null;
    createdAt: string;
}

export interface InboxSection {
    id: string;
    userId: string;
    name: string;
    orderIndex: number;
    createdAt: string;
}
