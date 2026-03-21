// Re-export inbox types for cross-package consumption via @cadence/backend/types/inbox
export type {
    InsertInboxItem,
    UpdateInboxItem,
    InsertInboxSection,
    UpdateInboxSection,
} from "../domains/inbox/inbox.schema";
