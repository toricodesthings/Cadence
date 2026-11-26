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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, createdAt, timestamptz, rlsUsing } from "./columns";
import { confidenceTierEnum, sourceSurfaceEnum, focusViewSourceEnum, ownerId, tasks } from "./core";
import type { FocusViewColor, FocusViewIcon } from "@cadence/contracts/settings";

export const usageEvents = pgTable(
    "usage_events",
    {
        id: id(),
        userId: ownerId(),
        event: text("event").notNull(),
        metadata: jsonb("metadata").$type<Record<string, unknown>>(),
        createdAt: createdAt(),
    },
    (table) => ({
        userCreatedIdx: index("usage_events_user_created_idx").on(table.userId, table.createdAt),
        rlsPolicy: pgPolicy("usage_events_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

export const notificationState = pgTable(
    "notification_state",
    {
        id: id(),
        userId: ownerId(),
        objectType: text("object_type").notNull(),
        objectId: uuid("object_id").notNull(),
        triggerId: text("trigger_id").notNull(),
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
        userObjectTriggerIdx: uniqueIndex("notification_state_user_object_trigger_unique").on(
            table.userId,
            table.objectId,
            table.triggerId,
        ),
        rlsPolicy: pgPolicy("notification_state_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

export const devices = pgTable(
    "devices",
    {
        id: id(),
        userId: ownerId(),
        installId: text("install_id").notNull(),
        kind: text("kind").notNull(),
        label: text("label").notNull(),
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
        endpointIdx: uniqueIndex("devices_endpoint_unique")
            .on(table.endpoint)
            .where(sql`${table.endpoint} IS NOT NULL`),
        rlsPolicy: pgPolicy("devices_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

export const pushDeliveries = pgTable(
    "push_deliveries",
    {
        id: id(),
        userId: ownerId(),
        deviceId: uuid("device_id")
            .references(() => devices.id, { onDelete: "cascade" })
            .notNull(),
        occurrenceKey: text("occurrence_key").notNull(),
        status: text("status").default("pending").notNull(),
        attempts: integer("attempts").default(1).notNull(),
        leaseUntil: timestamptz("lease_until").notNull(),
        createdAt: createdAt(),
    },
    (table) => ({
        occurrenceIdx: uniqueIndex("push_deliveries_device_occurrence_unique").on(table.deviceId, table.occurrenceKey),
        userCreatedIdx: index("push_deliveries_user_created_idx").on(table.userId, table.createdAt),
        rlsPolicy: pgPolicy("push_deliveries_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

export const mutationDedup = pgTable(
    "mutation_dedup",
    {
        id: id(),
        userId: ownerId(),
        clientMutationId: text("client_mutation_id").notNull(),
        resultId: uuid("result_id"),
        result: jsonb("result"),
        createdAt: createdAt(),
    },
    (table) => ({
        dedupIdx: uniqueIndex("mutation_dedup_user_mutation_idx").on(table.userId, table.clientMutationId),
        rlsPolicy: pgPolicy("mutation_dedup_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

export const taskNlpMetadata = pgTable(
    "task_nlp_metadata",
    {
        id: id(),
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

export const savedFocusViews = pgTable(
    "saved_focus_views",
    {
        id: id(),
        userId: ownerId(),
        name: text("name").notNull(),
        definition: jsonb("definition").$type<Record<string, unknown>>().default({}).notNull(),
        isPinned: boolean("is_pinned").default(false).notNull(),
        source: focusViewSourceEnum("source").default("preset").notNull(),
        orderIndex: doublePrecision("order_index").default(0).notNull(),
        presetKey: text("preset_key"),
        icon: text("icon").$type<FocusViewIcon>(),
        color: text("color").$type<FocusViewColor>(),
        isHidden: boolean("is_hidden").default(false).notNull(),
        createdAt: createdAt(),
        updatedAt: timestamptz("updated_at")
            .default(sql`now()`)
            .notNull(),
    },
    (table) => ({
        userIdIdx: index("saved_focus_views_user_id_idx").on(table.userId),
        presetKeyIdx: uniqueIndex("saved_focus_views_user_preset_key_idx").on(table.userId, table.presetKey),
        rlsPolicy: pgPolicy("saved_focus_views_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

export const dataExports = pgTable(
    "data_exports",
    {
        id: id(),
        userId: ownerId(),
        email: text("email").notNull(),
        status: text("status").$type<"pending" | "sent" | "failed">().default("pending").notNull(),
        bytes: integer("bytes"),
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
