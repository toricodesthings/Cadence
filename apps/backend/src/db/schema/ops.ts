import {
    pgTable,
    uuid,
    text,
    boolean,
    doublePrecision,
    date,
    integer,
    jsonb,
    index,
    uniqueIndex,
    check,
    pgPolicy,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createdAt, timestamptz, rlsUsing } from "./columns";
import { confidenceTierEnum, sourceSurfaceEnum, focusViewSourceEnum, ownerId, tasks } from "./core";

// 13. Usage Events (opt-in diagnostics; the daily cron deletes events older than USAGE_EVENT_RETENTION_DAYS)
export const usageEvents = pgTable(
    "usage_events",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: ownerId(),
        event: text("event").notNull(), // e.g. "task.complete", "task.reschedule", "habit.complete"
        metadata: jsonb("metadata").$type<Record<string, unknown>>(),
        createdAt: createdAt(),
    },
    (table) => ({
        userCreatedIdx: index("usage_events_user_created_idx").on(table.userId, table.createdAt), // per-person retention sweep
        rlsPolicy: pgPolicy("usage_events_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

// 13b. Notification State (persistent reminder/notification state per user+object+trigger)
export const notificationState = pgTable(
    "notification_state",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: ownerId(),
        objectType: text("object_type").notNull(), // "task" | "habit" | "event"
        objectId: uuid("object_id").notNull(),
        triggerId: text("trigger_id").notNull(), // e.g. "due_date_reminder", "habit_due"
        firstPresentedAt: timestamptz("first_presented_at"),
        lastPresentedAt: timestamptz("last_presented_at"),
        dismissedAt: timestamptz("dismissed_at"),
        deferredUntil: timestamptz("deferred_until"),
        actionTaken: text("action_taken"),
        presentationCount: integer("presentation_count").default(0).notNull(),
        createdAt: createdAt(),
        updatedAt: timestamptz("updated_at")
            .default(sql`now()`)
            .notNull(),
    },
    (table) => ({
        userObjectTriggerIdx: uniqueIndex("notification_state_user_object_trigger_unique")
            .on(table.userId, table.objectId, table.triggerId),
        rlsPolicy: pgPolicy("notification_state_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

// 13c. Devices: one row per browser profile, phone or installed app that may show this account's reminders.
// A device with push keys can be reached while Cadence is closed; the desktop app has none and alerts itself while running.
export const devices = pgTable(
    "devices",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: ownerId(),
        /** Stable identity of this browser profile or app install; survives a changed push endpoint. */
        installId: text("install_id").notNull(),
        /** "phone" | "computer" | "desktop-app" */
        kind: text("kind").notNull(),
        /** What the person sees in their device list ("Chrome on Windows"). */
        label: text("label").notNull(),
        /** Turned off here or from another device; the row stays so it can be turned back on. */
        enabled: boolean("enabled").default(true).notNull(),
        endpoint: text("endpoint"),
        p256dh: text("p256dh"),
        auth: text("auth"),
        lastSeenAt: timestamptz("last_seen_at"),
        lastSuccessAt: timestamptz("last_success_at"),
        failureCount: integer("failure_count").default(0).notNull(),
        createdAt: createdAt(),
    },
    (table) => ({
        userInstallIdx: uniqueIndex("devices_user_install_unique").on(table.userId, table.installId),
        // A push endpoint belongs to one account at a time (push_release_endpoint hands it over).
        endpointIdx: uniqueIndex("devices_endpoint_unique").on(table.endpoint).where(sql`${table.endpoint} IS NOT NULL`),
        rlsPolicy: pgPolicy("devices_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

// 13d. Push outbox: one row claims one reminder occurrence for one device, so no scheduler run repeats it.
export const pushDeliveries = pgTable(
    "push_deliveries",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: ownerId(),
        deviceId: uuid("device_id")
            .references(() => devices.id, { onDelete: "cascade" })
            .notNull(),
        occurrenceKey: text("occurrence_key").notNull(),
        /** pending = claimed (lease), sent = accepted by the push service. A failed send releases the claim. */
        status: text("status").default("pending").notNull(),
        attempts: integer("attempts").default(1).notNull(),
        leaseUntil: timestamptz("lease_until").notNull(),
        createdAt: createdAt(),
    },
    (table) => ({
        occurrenceIdx: uniqueIndex("push_deliveries_device_occurrence_unique").on(table.deviceId, table.occurrenceKey),
        userCreatedIdx: index("push_deliveries_user_created_idx").on(table.userId, table.createdAt), // per-person prune
        rlsPolicy: pgPolicy("push_deliveries_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

// 15. Mutation Dedup (Idempotent offline replay)
export const mutationDedup = pgTable(
    "mutation_dedup",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: ownerId(),
        clientMutationId: text("client_mutation_id").notNull(),
        resultId: uuid("result_id"),
        /** What the first call returned (assistant tools), so a retry gets the same ids back. */
        result: jsonb("result"),
        createdAt: createdAt(),
    },
    (table) => ({
        dedupIdx: uniqueIndex("mutation_dedup_user_mutation_idx").on(
            table.userId,
            table.clientMutationId,
        ),
        rlsPolicy: pgPolicy("mutation_dedup_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

// ── 16. Task NLP Metadata (Parse result snapshots) ──
export const taskNlpMetadata = pgTable(
    "task_nlp_metadata",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        taskId: uuid("task_id")
            .references(() => tasks.id, { onDelete: "cascade" })
            .notNull(),
        userId: ownerId(),
        parserVersion: text("parser_version").default("2.0.0").notNull(),
        sourceSurface: sourceSurfaceEnum("source_surface").default("quick_add").notNull(),
        rawInput: text("raw_input").notNull(),
        cleanedTitle: text("cleaned_title").notNull(),
        parseResult: jsonb("parse_result").$type<Record<string, unknown>>().default({}).notNull(),
        confidenceTier: confidenceTierEnum("confidence_tier").default("medium").notNull(),
        // ── Resolved columns (queryable without unpacking JSON) ──
        resolvedDueDate: date("resolved_due_date", { mode: "string" }),
        resolvedScheduledStart: timestamptz("resolved_scheduled_start"),
        resolvedScheduledEnd: timestamptz("resolved_scheduled_end"),
        resolvedRecurrenceRule: text("resolved_recurrence_rule"),
        resolvedProjectId: uuid("resolved_project_id"),
        resolvedTagIds: jsonb("resolved_tag_ids").$type<string[]>(),
        resolvedPriority: text("resolved_priority"),
        resolvedDurationMinutes: integer("resolved_duration_minutes"),
        resolvedWaitingOn: text("resolved_waiting_on"),
        needsReview: boolean("needs_review").default(false).notNull(),
        reviewReason: text("review_reason"),
        entityCount: integer("entity_count").default(0).notNull(),
        highConfidenceEntityCount: integer("high_confidence_entity_count").default(0).notNull(),
        mediumConfidenceEntityCount: integer("medium_confidence_entity_count").default(0).notNull(),
        lowConfidenceEntityCount: integer("low_confidence_entity_count").default(0).notNull(),
        isCurrent: boolean("is_current").default(true).notNull(),
        createdAt: createdAt(),
    },
    (table) => ({
        taskIdIdx: uniqueIndex("task_nlp_metadata_task_id_unique").on(table.taskId),
        userIdIdx: index("task_nlp_metadata_user_id_idx").on(table.userId),
        rlsPolicy: pgPolicy("task_nlp_metadata_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

// ── 17. Saved Focus Views ──
export const savedFocusViews = pgTable(
    "saved_focus_views",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: ownerId(),
        name: text("name").notNull(),
        definition: jsonb("definition").$type<Record<string, unknown>>().default({}).notNull(),
        isPinned: boolean("is_pinned").default(false).notNull(),
        source: focusViewSourceEnum("source").default("preset").notNull(),
        orderIndex: doublePrecision("order_index").default(0).notNull(),
        createdAt: createdAt(),
        updatedAt: timestamptz("updated_at")
            .default(sql`now()`)
            .notNull(),
    },
    (table) => ({
        userIdIdx: index("saved_focus_views_user_id_idx").on(table.userId),
        rlsPolicy: pgPolicy("saved_focus_views_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

// ── 18. Data Exports (the record of each emailed copy of a person's data; erased with the account) ──
export const dataExports = pgTable(
    "data_exports",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: ownerId(),
        email: text("email").notNull(), // where it was sent, as the sign-in account had it then
        status: text("status").$type<"pending" | "sent" | "failed">().default("pending").notNull(),
        bytes: integer("bytes"), // size of the attached file once built
        requestedAt: timestamptz("requested_at")
            .default(sql`now()`)
            .notNull(),
        completedAt: timestamptz("completed_at"),
    },
    (table) => ({
        userRequestedIdx: index("data_exports_user_requested_idx").on(table.userId, table.requestedAt),
        statusCheck: check("data_exports_status_check", sql`status IN ('pending', 'sent', 'failed')`),
        rlsPolicy: pgPolicy("data_exports_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();
