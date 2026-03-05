export interface InboxItem {
    id: string;
    userId: string;
    rawText: string;
    sectionId: string | null;
    orderIndex: number;
    processed: boolean;
    createdAt: string;
}

export interface InboxSection {
    id: string;
    userId: string;
    name: string;
    orderIndex: number;
    createdAt: string;
}
