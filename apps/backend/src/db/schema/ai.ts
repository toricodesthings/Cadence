import {
    pgTable,
    uuid,
    text,
    customType,
    boolean,
    doublePrecision,
    date,
    integer,
    jsonb,
    halfvec,
    index,
    uniqueIndex,
    unique,
    primaryKey,
    check,
    pgPolicy,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, createdAt, timestamptz, rlsUsing } from "./columns";
import {
    memoryKindEnum,
    memorySourceEnum,
    memoryConfidenceEnum,
    memoryStatusEnum,
    memorySignalKindEnum,
    aiMessageRoleEnum,
    aiMessageStatusEnum,
    ownerId,
    tasks,
    habits,
} from "./core";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const aiMemories = pgTable(
    "ai_memories",
    {
        id: id(),
        userId: ownerId(),
        kind: memoryKindEnum("kind").notNull(),
        content: text("content").notNull(),
        value: jsonb("value").$type<Record<string, unknown>>(),
        embedding: halfvec("embedding", { dimensions: 512 }),
        embeddingModel: text("embedding_model"),
        search: tsvector("search").generatedAlwaysAs(sql`to_tsvector('english', content)`),
        contentHash: text("content_hash"),
        saidOn: date("said_on", { mode: "string" }).notNull(),
        lastSeenOn: date("last_seen_on", { mode: "string" }).notNull(),
        seenCount: integer("seen_count").default(1).notNull(),
        validThrough: date("valid_through", { mode: "string" }),
        source: memorySourceEnum("source").notNull(),
        confidence: memoryConfidenceEnum("confidence").notNull(),
        sensitive: boolean("sensitive").default(false).notNull(),
        pinned: boolean("pinned").default(false).notNull(),
        status: memoryStatusEnum("status").default("active").notNull(),
        forgottenAt: timestamptz("forgotten_at"),
        sourceConversationId: uuid("source_conversation_id").references(() => aiConversations.id, {
            onDelete: "set null",
        }),
        sourceMessageId: text("source_message_id"),
        createdAt: createdAt(),
        updatedAt: timestamptz("updated_at")
            .default(sql`now()`)
            .notNull(),
    },
    (table) => {
        return {
            userStatusIdx: index("ai_memories_user_status_idx").on(table.userId, table.status),
            hashUnique: uniqueIndex("ai_memories_user_hash_unique")
                .on(table.userId, table.contentHash)
                .where(sql`${table.status} = 'active'`),
            sourceConversationIdx: index("ai_memories_source_conversation_id_idx")
                .on(table.sourceConversationId)
                .where(sql`${table.sourceConversationId} IS NOT NULL`),
            rlsPolicy: pgPolicy("ai_memories_owner_access", {
                as: "permissive",
                for: "all",
                using: rlsUsing,
                withCheck: rlsUsing,
            }),
        };
    },
).enableRLS();

export const aiMemorySignals = pgTable(
    "ai_memory_signals",
    {
        id: id(),
        userId: ownerId(),
        kind: memorySignalKindEnum("kind").notNull(),
        on: date("on", { mode: "string" }).notNull(),
        bucket: text("bucket").notNull(),
        subject: text("subject"),
        minutes: integer("minutes"),
        taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
        habitId: uuid("habit_id").references(() => habits.id, { onDelete: "cascade" }),
        createdAt: createdAt(),
    },
    (table) => ({
        userKindIdx: index("ai_memory_signals_user_kind_idx").on(table.userId, table.kind, table.on),
        rlsPolicy: pgPolicy("ai_memory_signals_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

export const durationReports = pgTable(
    "duration_reports",
    {
        id: id(),
        userId: ownerId(),
        taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
        completedAt: timestamptz("completed_at"),
        habitId: uuid("habit_id").references(() => habits.id, { onDelete: "cascade" }),
        targetDate: date("target_date", { mode: "string" }),
        wallTime: text("wall_time"),
        lowMinutes: integer("low_minutes").notNull(),
        highMinutes: integer("high_minutes").notNull(),
        anchored: boolean("anchored").default(false).notNull(),
        title: text("title").notNull(),
        projectId: uuid("project_id"),
        groupKey: text("group_key").notNull(),
        saidOn: date("said_on", { mode: "string" }).notNull(),
        forgottenAt: timestamptz("forgotten_at"),
        createdAt: createdAt(),
        updatedAt: timestamptz("updated_at")
            .default(sql`now()`)
            .notNull(),
    },
    (table) => ({
        completionUnique: unique("duration_reports_task_completed_unique").on(table.taskId, table.completedAt),
        occurrenceUnique: uniqueIndex("duration_reports_habit_occurrence_unique").on(
            table.habitId,
            table.targetDate,
            sql`coalesce(${table.wallTime}, '')`,
        ),
        userSaidIdx: index("duration_reports_user_said_idx").on(table.userId, table.saidOn.desc()),
        userGroupIdx: index("duration_reports_user_group_idx").on(table.userId, table.groupKey),
        lowCheck: check("duration_reports_low_check", sql`low_minutes BETWEEN 1 AND 1440`),
        highCheck: check("duration_reports_high_check", sql`high_minutes BETWEEN low_minutes AND 1440`),
        subjectCheck: check(
            "duration_reports_subject_check",
            sql`(task_id IS NOT NULL AND completed_at IS NOT NULL AND habit_id IS NULL AND target_date IS NULL) OR (habit_id IS NOT NULL AND target_date IS NOT NULL AND task_id IS NULL AND completed_at IS NULL)`,
        ),
        rlsPolicy: pgPolicy("duration_reports_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

export const planningRecords = pgTable(
    "planning_records",
    {
        id: id(),
        userId: ownerId(),
        taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
        kind: text("kind").notNull(),
        projectId: uuid("project_id"),
        chosen: text("chosen"),
        feasible: text("feasible").array(),
        suggested: boolean("suggested").notNull(),
        outcome: text("outcome").notNull(),
        fingerprint: text("fingerprint"),
        saidOn: date("said_on", { mode: "string" }).notNull(),
        forgottenAt: timestamptz("forgotten_at"),
        createdAt: createdAt(),
    },
    (table) => ({
        userKindIdx: index("planning_records_user_kind_idx").on(table.userId, table.kind, table.saidOn.desc()),
        taskIdx: index("planning_records_task_idx").on(table.taskId),
        kindCheck: check("planning_records_kind_check", sql`kind IN ('slot', 'steps', 'later')`),
        outcomeCheck: check("planning_records_outcome_check", sql`outcome IN ('chosen', 'declined')`),
        rlsPolicy: pgPolicy("planning_records_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

export const aiMemoryNotes = pgTable(
    "ai_memory_notes",
    {
        userId: ownerId(),
        taskId: uuid("task_id")
            .references(() => tasks.id, { onDelete: "cascade" })
            .notNull(),
        lineHashes: text("line_hashes").array().notNull(),
        readAt: timestamptz("read_at")
            .default(sql`now()`)
            .notNull(),
    },
    (table) => ({
        pk: primaryKey({ columns: [table.userId, table.taskId] }),
        rlsPolicy: pgPolicy("ai_memory_notes_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

export const aiConversations = pgTable(
    "ai_conversations",
    {
        id: id(),
        userId: ownerId(),
        title: text("title"),
        model: text("model"),
        lastMessageAt: timestamptz("last_message_at"),
        archived: boolean("archived").default(false).notNull(),
        metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
        activeStreamId: text("active_stream_id"),
        lastStreamId: text("last_stream_id"),
        lastStreamStatus: text("last_stream_status"),
        createdAt: createdAt(),
        updatedAt: timestamptz("updated_at")
            .default(sql`now()`)
            .notNull(),
    },
    (table) => ({
        userRecentIdx: index("ai_conversations_user_recent_idx").on(table.userId, table.lastMessageAt),
        rlsPolicy: pgPolicy("ai_conversations_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

export const aiMessages = pgTable(
    "ai_messages",
    {
        id: text("id").primaryKey(),
        conversationId: uuid("conversation_id")
            .references(() => aiConversations.id, { onDelete: "cascade" })
            .notNull(),
        userId: ownerId(),
        role: aiMessageRoleEnum("role").notNull(),
        parts: jsonb("parts").$type<unknown[]>().notNull(),
        metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
        status: aiMessageStatusEnum("status").default("complete").notNull(),
        orderIndex: doublePrecision("order_index").notNull(),
        searchText: text("search_text"),
        createdAt: createdAt(),
    },
    (table) => ({
        convoOrderIdx: index("ai_messages_convo_order_idx").on(table.conversationId, table.orderIndex),
        userIdIdx: index("ai_messages_user_id_idx").on(table.userId),
        searchIdx: index("ai_messages_search_idx").using(
            "gin",
            sql`to_tsvector('english', coalesce(${table.searchText}, ''))`,
        ),
        rlsPolicy: pgPolicy("ai_messages_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

export const aiImages = pgTable(
    "ai_images",
    {
        id: id(),
        userId: ownerId(),
        conversationId: uuid("conversation_id").notNull(),
        contentHash: text("content_hash").notNull(),
        bytes: integer("bytes").notNull(),
        mediaType: text("media_type", { enum: ["image/webp", "application/pdf"] })
            .default("image/webp")
            .notNull(),
        pages: integer("pages"),
        width: integer("width"),
        height: integer("height"),
        createdAt: createdAt(),
        sentAt: timestamptz("sent_at"),
        lastUsedAt: timestamptz("last_used_at")
            .default(sql`now()`)
            .notNull(),
        diagnosticsSharedAt: timestamptz("diagnostics_shared_at"),
    },
    (table) => ({
        mediaTypeCheck: check(
            "ai_images_media_type_check",
            sql`${table.mediaType} in ('image/webp','application/pdf')`,
        ),
        dedupUnique: uniqueIndex("ai_images_user_convo_hash_unique").on(
            table.userId,
            table.conversationId,
            table.contentHash,
        ),
        rlsPolicy: pgPolicy("ai_images_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

export const mcpConnections = pgTable(
    "mcp_connections",
    {
        id: id(),
        userId: ownerId(),
        clientId: text("client_id").notNull(),
        clientName: text("client_name").notNull(),
        redirectUri: text("redirect_uri").notNull(),
        scopes: text("scopes").array().notNull(),
        createdAt: createdAt(),
        lastUsedAt: timestamptz("last_used_at"),
        revokedAt: timestamptz("revoked_at"),
    },
    (table) => ({
        userIdIdx: index("mcp_connections_user_id_idx").on(table.userId),
        rlsPolicy: pgPolicy("mcp_connections_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();
