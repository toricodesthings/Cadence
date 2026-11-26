import {
    pgTable,
    uuid,
    text,
    boolean,
    real,
    doublePrecision,
    date,
    integer,
    pgEnum,
    jsonb,
    index,
    uniqueIndex,
    primaryKey,
    check,
    pgPolicy,
} from "drizzle-orm/pg-core";
import { userSettingsSchema, type UserSettings } from "@cadence/contracts/settings";
import { relations, sql } from "drizzle-orm";
import {
    id,
    createdAt,
    timestamptz,
    rlsUserId,
    rlsUsing,
    memberView,
    memberEdit,
    memberEventView,
    memberEventEdit,
    memberRoutineView,
    memberRoutineEdit,
} from "./columns";

export { userSettingsSchema as UserSettingsSchema, type UserSettings };

export const taskStateEnum = pgEnum("task_state", ["ACTIVE", "WAITING", "COMPLETE", "ARCHIVED"]);
export const taskInteractionModeEnum = pgEnum("task_interaction_mode", ["task", "timetable"]);
export const memoryKindEnum = pgEnum("memory_kind", [
    "preference",
    "quirk",
    "life",
    "constraint",
    "pattern",
    "duration",
    "assist",
]);
export const memorySourceEnum = pgEnum("memory_source", ["explicit", "chat", "note", "activity", "backfill"]);
export const memoryConfidenceEnum = pgEnum("memory_confidence", ["stated", "observed", "inferred"]);
export const memoryStatusEnum = pgEnum("memory_status", ["active", "forgotten"]);
export const memorySignalKindEnum = pgEnum("memory_signal_kind", ["reschedule", "complete", "routine", "duration"]);
export const habitStatusEnum = pgEnum("habit_status", ["COMPLETED", "SKIPPED", "PENDING"]);
export const captureKindEnum = pgEnum("capture_kind", ["task", "thought", "reference", "unknown"]);
export const captureStatusEnum = pgEnum("capture_status", ["clarifying", "placed", "kept", "discarded"]);
export const analysisStatusEnum = pgEnum("analysis_status", ["pending", "parsed", "reviewed", "applied", "dismissed"]);
export const confidenceTierEnum = pgEnum("confidence_tier", ["high", "medium", "low"]);
export const sourceSurfaceEnum = pgEnum("source_surface", [
    "inline_add",
    "quick_add",
    "holding_capture",
    "holding_clarify",
    "clarify_sheet",
    "task_edit_title",
    "task_edit_note",
    "focus_view_composer",
    "inbox_card",
    "inbox",
]);
export const shareRoleEnum = pgEnum("share_role", ["view", "edit"]);
export const routineShareModeEnum = pgEnum("routine_share_mode", ["together", "turns"]);
export const focusViewSourceEnum = pgEnum("focus_view_source", ["preset", "composed", "manual"]);

export const aiMessageRoleEnum = pgEnum("ai_message_role", ["user", "assistant", "system"]);
export const aiMessageStatusEnum = pgEnum("ai_message_status", ["streaming", "complete", "failed", "aborted"]);

export const users = pgTable(
    "users",
    {
        id: uuid("id").primaryKey(),
        settings: jsonb("settings")
            .$type<UserSettings>()
            .default({
                tasks: {
                    defaultDueDate: null,
                    hideTrash: false,
                    hideCompleted: false,
                    quickAdd: {
                        preset: "planner",
                        style: "label",
                        actions: ["date", "priority", "project"],
                    },
                },
                dateTime: { weekStart: "Sunday", timezone: "device", timeDisplay: "12h" },
                calendar: {
                    clutter: {
                        showAllDay: true,
                        showTimedTasks: true,
                        showHabitAnchors: true,
                    },
                    holidays: {
                        enabled: true,
                    },
                },
                notifications: {
                    email: true,
                    browser: false,
                    taskReminders: true,
                    habitReminders: true,
                    dueDateAlerts: true,
                },
                shortcuts: {},
            })
            .notNull(),
        timeZone: text("time_zone").default("UTC").notNull(),
        createdAt: createdAt(),
    },
    () => ({
        rlsPolicy: pgPolicy("users_owner_access", {
            as: "permissive",
            for: "all",
            using: sql`(id = ${rlsUserId})`,
            withCheck: sql`(id = ${rlsUserId})`,
        }),
    }),
).enableRLS();

export const ownerId = () =>
    uuid("user_id")
        .references(() => users.id, { onDelete: "cascade" })
        .notNull();

export const createdBy = () =>
    uuid("created_by")
        .references(() => users.id, { onDelete: "set null" })
        .default(sql`(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid`);

export const updatedBy = () => uuid("updated_by").references(() => users.id, { onDelete: "set null" });

export const userMetrics = pgTable(
    "user_metrics",
    {
        id: id(),
        userId: ownerId(),
        rescheduleVelocity: real("reschedule_velocity").default(0).notNull(),
        currentBurnoutIndex: integer("current_burnout_index"),
        completionRatio: real("completion_ratio").default(0).notNull(),
        overdueCarryLoad: integer("overdue_carry_load").default(0).notNull(),
        habitAdherenceRate: real("habit_adherence_rate").default(0).notNull(),
        scheduleDensity: real("schedule_density").default(0).notNull(),
        lastCalculatedAt: timestamptz("last_calculated_at")
            .default(sql`now()`)
            .notNull(),
    },
    (table) => {
        return {
            userIdIdx: uniqueIndex("user_metrics_user_id_unique").on(table.userId),
            rlsPolicy: pgPolicy("user_metrics_owner_access", {
                as: "permissive",
                for: "all",
                using: rlsUsing,
                withCheck: rlsUsing,
            }),
        };
    },
).enableRLS();

const memberOwned = sql`(project_id IN ${memberEdit} AND user_id = (SELECT p.user_id FROM projects p WHERE p.id = project_id))`;

const sameOwnerAs = (name: string, owner: ReturnType<typeof sql>) => ({
    [`${name}SameOwnerInsert`]: pgPolicy(`${name}_same_owner_insert`, {
        as: "restrictive",
        for: "insert",
        withCheck: owner,
    }),
    [`${name}SameOwnerUpdate`]: pgPolicy(`${name}_same_owner_update`, {
        as: "restrictive",
        for: "update",
        using: sql`true`,
        withCheck: owner,
    }),
});
const sameOwnerAsList = sql`(project_id IS NULL OR user_id = (SELECT p.user_id FROM projects p WHERE p.id = project_id))`;
const sameOwnerAsTask = sql`(user_id = (SELECT t.user_id FROM tasks t WHERE t.id = task_id))`;

export const taskSections = pgTable(
    "task_sections",
    {
        id: id(),
        userId: ownerId(),
        projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        orderIndex: doublePrecision("order_index").notNull(),
        createdBy: createdBy(),
        createdAt: createdAt(),
    },
    (table) => ({
        userIdIdx: index("task_sections_user_id_idx").on(table.userId),
        projectIdIdx: index("task_sections_project_id_idx").on(table.projectId),
        rlsPolicy: pgPolicy("task_sections_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
        ...sameOwnerAs("task_sections", sameOwnerAsList),
        memberRead: pgPolicy("task_sections_member_read", {
            as: "permissive",
            for: "select",
            using: sql`project_id IN ${memberView}`,
        }),
        memberInsert: pgPolicy("task_sections_member_insert", {
            as: "permissive",
            for: "insert",
            withCheck: memberOwned,
        }),
        memberUpdate: pgPolicy("task_sections_member_update", {
            as: "permissive",
            for: "update",
            using: sql`project_id IN ${memberEdit}`,
            withCheck: memberOwned,
        }),
    }),
).enableRLS();

export const projects = pgTable(
    "projects",
    {
        id: id(),
        userId: ownerId(),
        name: text("name").notNull(),
        colorAccent: text("color_accent").default("luminous-amber"),
        emoji: text("emoji"),
        createdAt: createdAt(),
    },
    (table) => ({
        userIdIdx: index("projects_user_id_idx").on(table.userId),
        rlsPolicy: pgPolicy("projects_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
        memberRead: pgPolicy("projects_member_read", {
            as: "permissive",
            for: "select",
            using: sql`id IN ${memberView}`,
        }),
    }),
).enableRLS();

export const listMembers = pgTable(
    "list_members",
    {
        listId: uuid("list_id")
            .references(() => projects.id, { onDelete: "cascade" })
            .notNull(),
        userId: uuid("user_id")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        role: shareRoleEnum("role").default("view").notNull(),
        invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
        joinedAt: createdAt(),
    },
    (table) => ({
        pk: primaryKey({ columns: [table.listId, table.userId] }),
        userIdIdx: index("list_members_user_id_idx").on(table.userId),
        readPolicy: pgPolicy("list_members_read", {
            as: "permissive",
            for: "select",
            using: sql`(user_id = ${rlsUserId} OR list_id IN (SELECT id FROM projects WHERE user_id = ${rlsUserId}) OR list_id IN ${memberView})`,
        }),
        ownerUpdate: pgPolicy("list_members_owner_update", {
            as: "permissive",
            for: "update",
            using: sql`list_id IN (SELECT id FROM projects WHERE user_id = ${rlsUserId})`,
            withCheck: sql`list_id IN (SELECT id FROM projects WHERE user_id = ${rlsUserId})`,
        }),
        deletePolicy: pgPolicy("list_members_delete", {
            as: "permissive",
            for: "delete",
            using: sql`(user_id = ${rlsUserId} OR list_id IN (SELECT id FROM projects WHERE user_id = ${rlsUserId}))`,
        }),
    }),
).enableRLS();

export const personalEvents = pgTable(
    "personal_events",
    {
        id: id(),
        userId: ownerId(),
        label: text("label").notNull(),
        monthDay: text("month_day").notNull(),
        emoji: text("emoji"),
        notify: boolean("notify").notNull().default(true),
        startedOn: date("started_on", { mode: "string" }),
        color: text("color"),
        createdAt: createdAt(),
        updatedAt: timestamptz("updated_at")
            .default(sql`now()`)
            .notNull(),
    },
    (table) => ({
        userIdIdx: index("personal_events_user_id_idx").on(table.userId),
        labelLen: check("personal_events_label_len", sql`char_length(${table.label}) BETWEEN 1 AND 80`),
        monthDayFormat: check(
            "personal_events_month_day",
            sql`${table.monthDay} ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'`,
        ),
        emojiLen: check("personal_events_emoji_len", sql`${table.emoji} IS NULL OR char_length(${table.emoji}) <= 4`),
        rlsPolicy: pgPolicy("personal_events_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
        memberRead: pgPolicy("personal_events_member_read", {
            as: "permissive",
            for: "select",
            using: sql`id IN ${memberEventView}`,
        }),
        memberUpdate: pgPolicy("personal_events_member_update", {
            as: "permissive",
            for: "update",
            using: sql`id IN ${memberEventEdit}`,
            withCheck: sql`id IN ${memberEventEdit}`,
        }),
    }),
).enableRLS();

export const eventMembers = pgTable(
    "event_members",
    {
        eventId: uuid("event_id")
            .references(() => personalEvents.id, { onDelete: "cascade" })
            .notNull(),
        userId: uuid("user_id")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        role: shareRoleEnum("role").default("edit").notNull(),
        invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
        notify: boolean("notify").default(true).notNull(),
        joinedAt: timestamptz("joined_at")
            .default(sql`now()`)
            .notNull(),
    },
    (table) => ({
        pk: primaryKey({ columns: [table.eventId, table.userId] }),
        userIdIdx: index("event_members_user_id_idx").on(table.userId),
        readPolicy: pgPolicy("event_members_read", {
            as: "permissive",
            for: "select",
            using: sql`(user_id = ${rlsUserId} OR event_id IN (SELECT id FROM personal_events WHERE user_id = ${rlsUserId}) OR event_id IN ${memberEventView})`,
        }),
        ownerUpdate: pgPolicy("event_members_owner_update", {
            as: "permissive",
            for: "update",
            using: sql`event_id IN (SELECT id FROM personal_events WHERE user_id = ${rlsUserId})`,
            withCheck: sql`event_id IN (SELECT id FROM personal_events WHERE user_id = ${rlsUserId})`,
        }),
        deletePolicy: pgPolicy("event_members_delete", {
            as: "permissive",
            for: "delete",
            using: sql`(user_id = ${rlsUserId} OR event_id IN (SELECT id FROM personal_events WHERE user_id = ${rlsUserId}))`,
        }),
    }),
).enableRLS();

export const shareInvites = pgTable(
    "share_invites",
    {
        id: id(),
        tokenHash: text("token_hash").notNull().unique(),
        role: shareRoleEnum("role").default("view").notNull(),
        listId: uuid("list_id").references(() => projects.id, { onDelete: "cascade" }),
        eventId: uuid("event_id").references(() => personalEvents.id, { onDelete: "cascade" }),
        routineId: uuid("routine_id").references(() => habits.id, { onDelete: "cascade" }),
        createdBy: uuid("created_by")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        expiresAt: timestamptz("expires_at").notNull(),
        createdAt: createdAt(),
    },
    (table) => ({
        listIdIdx: index("share_invites_list_id_idx").on(table.listId),
        eventIdIdx: index("share_invites_event_id_idx").on(table.eventId),
        routineIdIdx: index("share_invites_routine_id_idx").on(table.routineId),
        oneTarget: check("share_invites_one_target", sql`num_nonnulls(list_id, event_id, routine_id) = 1`),
        ownerAccess: pgPolicy("share_invites_owner_access", {
            as: "permissive",
            for: "all",
            using: sql`(list_id IN (SELECT id FROM projects WHERE user_id = ${rlsUserId}) OR event_id IN (SELECT id FROM personal_events WHERE user_id = ${rlsUserId}) OR routine_id IN (SELECT id FROM habits WHERE user_id = ${rlsUserId}))`,
            withCheck: sql`(list_id IN (SELECT id FROM projects WHERE user_id = ${rlsUserId}) OR event_id IN (SELECT id FROM personal_events WHERE user_id = ${rlsUserId}) OR routine_id IN (SELECT id FROM habits WHERE user_id = ${rlsUserId}))`,
        }),
    }),
).enableRLS();

export const tasks = pgTable(
    "tasks",
    {
        origin: text("origin", { enum: ["thought"] }),
        id: id(),
        userId: ownerId(),
        projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
        sectionId: uuid("section_id").references(() => taskSections.id, { onDelete: "set null" }),

        title: text("title").notNull(),
        content: text("content"),
        state: taskStateEnum("state").default("ACTIVE").notNull(),

        orderIndex: doublePrecision("order_index").notNull(),

        dueDate: date("due_on", { mode: "string" }),
        endDate: date("end_on", { mode: "string" }),
        scheduledStart: timestamptz("scheduled_start"),
        scheduledEnd: timestamptz("scheduled_end"),
        zone: text("zone"),
        durationEstimate: integer("duration_estimate"),
        timezoneLocked: boolean("timezone_locked").default(false).notNull(),

        priority: integer("priority").default(0).notNull(),

        isPinned: boolean("is_pinned").default(false).notNull(),

        reminderAt: timestamptz("reminder_at"),
        reminderSilenced: boolean("reminder_silenced").default(false).notNull(),

        recurrenceRule: text("recurrence_rule"),
        interactionMode: taskInteractionModeEnum("interaction_mode").default("task").notNull(),

        waitingOn: text("waiting_on"),
        waitingReminder: timestamptz("waiting_reminder"),
        effort: integer("effort"),
        effortOrigin: text("effort_origin"),
        effortChosenAt: timestamptz("effort_chosen_at"),
        effortGuess: integer("effort_guess"),
        effortGuessSource: text("effort_guess_source"),
        effortGuessAt: timestamptz("effort_guess_at"),
        notBefore: date("hidden_until", { mode: "string" }),
        linkedAppId: text("linked_app_id"),
        linkedUrl: text("linked_url"),
        completedAt: timestamptz("completed_at"),

        takenBy: uuid("taken_by").references(() => users.id, { onDelete: "set null" }),
        takenAt: timestamptz("taken_at"),

        createdBy: createdBy(),
        updatedBy: updatedBy(),
        createdAt: createdAt(),
        updatedAt: timestamptz("updated_at")
            .default(sql`now()`)
            .notNull(),
    },
    (table) => {
        return {
            userListIdx: index("tasks_user_list_idx").on(
                table.userId,
                table.state,
                table.isPinned.desc().nullsFirst(),
                table.orderIndex,
            ),
            userUpdatedIdx: index("tasks_user_updated_idx").on(table.userId, table.state, table.updatedAt, table.id),
            userDueIdx: index("tasks_user_due_idx").on(table.userId, table.dueDate),
            userStartIdx: index("tasks_user_start_idx").on(table.userId, table.scheduledStart),
            userSeriesIdx: index("tasks_user_series_idx")
                .on(table.userId)
                .where(sql`${table.recurrenceRule} IS NOT NULL`),
            overdueIdx: index("tasks_overdue_idx")
                .on(table.dueDate)
                .where(sql`${table.state} = 'ACTIVE'`),
            projectIdIdx: index("tasks_project_id_idx").on(table.projectId),
            sectionIdIdx: index("tasks_section_id_idx").on(table.sectionId),
            linkedUrlCheck: check(
                "tasks_linked_url_check",
                sql`linked_url IS NULL OR (linked_url LIKE 'https://%' AND length(linked_url) <= 2048)`,
            ),
            completedAtCheck: check("tasks_completed_at_check", sql`(state = 'COMPLETE') = (completed_at IS NOT NULL)`),
            effortCheck: check("tasks_effort_check", sql`effort IS NULL OR effort BETWEEN 1 AND 3`),
            effortOriginCheck: check(
                "tasks_effort_origin_check",
                sql`effort_origin IS NULL OR (effort IS NOT NULL AND effort_origin IN ('manual', 'accepted'))`,
            ),
            effortGuessCheck: check(
                "tasks_effort_guess_check",
                sql`effort_guess IS NULL OR effort_guess BETWEEN 1 AND 3`,
            ),
            effortGuessSourceCheck: check(
                "tasks_effort_guess_source_check",
                sql`effort_guess_source IS NULL OR effort_guess_source IN ('model', 'dismissed')`,
            ),
            userEffortIdx: index("tasks_user_effort_idx")
                .on(table.userId, table.effortChosenAt.desc())
                .where(sql`${table.effortOrigin} IS NOT NULL`),
            timedHasZoneCheck: check("tasks_timed_zone_check", sql`scheduled_start IS NULL OR zone IS NOT NULL`),
            noEndWithoutStartCheck: check(
                "tasks_end_needs_start_check",
                sql`scheduled_start IS NOT NULL OR scheduled_end IS NULL`,
            ),
            endOnCheck: check("tasks_end_on_check", sql`end_on IS NULL OR (due_on IS NOT NULL AND end_on >= due_on)`),
            timedNoEndOnCheck: check("tasks_timed_end_on_check", sql`scheduled_start IS NULL OR end_on IS NULL`),
            rlsPolicy: pgPolicy("tasks_owner_access", {
                as: "permissive",
                for: "all",
                using: rlsUsing,
                withCheck: rlsUsing,
            }),
            ...sameOwnerAs("tasks", sameOwnerAsList),
            memberRead: pgPolicy("tasks_member_read", {
                as: "permissive",
                for: "select",
                using: sql`project_id IN ${memberView}`,
            }),
            memberInsert: pgPolicy("tasks_member_insert", {
                as: "permissive",
                for: "insert",
                withCheck: memberOwned,
            }),
            memberUpdate: pgPolicy("tasks_member_update", {
                as: "permissive",
                for: "update",
                using: sql`project_id IN ${memberEdit}`,
                withCheck: memberOwned,
            }),
        };
    },
).enableRLS();

export const taskPersonal = pgTable(
    "task_personal",
    {
        taskId: uuid("task_id")
            .references(() => tasks.id, { onDelete: "cascade" })
            .notNull(),
        userId: ownerId(),
        reminderAt: timestamptz("reminder_at"),
        reminderSilenced: boolean("reminder_silenced").default(false).notNull(),
        createdAt: createdAt(),
    },
    (table) => ({
        pk: primaryKey({ columns: [table.taskId, table.userId] }),
        userIdIdx: index("task_personal_user_id_idx").on(table.userId),
        rlsPolicy: pgPolicy("task_personal_access", {
            as: "permissive",
            for: "all",
            using: sql`(user_id = ${rlsUserId} AND task_id IN (SELECT id FROM tasks))`,
            withCheck: sql`(user_id = ${rlsUserId} AND task_id IN (SELECT id FROM tasks))`,
        }),
    }),
).enableRLS();

export const tags = pgTable(
    "tags",
    {
        id: id(),
        userId: ownerId(),
        name: text("name").notNull(),
        color: text("color").default("default"),
        sortOrder: doublePrecision("sort_order").notNull().default(0),
        createdAt: createdAt(),
    },
    (table) => ({
        userNameUnique: uniqueIndex("tags_user_name_unique").on(table.userId, sql`lower(${table.name})`),
        rlsPolicy: pgPolicy("tags_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

export const taskTags = pgTable(
    "task_tags",
    {
        id: id(),
        taskId: uuid("task_id")
            .references(() => tasks.id, { onDelete: "cascade" })
            .notNull(),
        tagId: uuid("tag_id")
            .references(() => tags.id, { onDelete: "cascade" })
            .notNull(),
    },
    (table) => ({
        uniquePair: uniqueIndex("task_tags_unique_pair").on(table.taskId, table.tagId),
        tagIdIdx: index("task_tags_tag_id_idx").on(table.tagId),
        rlsPolicy: pgPolicy("task_tags_owner_access", {
            as: "permissive",
            for: "all",
            using: sql`(EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = ${rlsUserId}) AND tag_id IN (SELECT id FROM tags WHERE user_id = ${rlsUserId}))`,
            withCheck: sql`(EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = ${rlsUserId}) AND tag_id IN (SELECT id FROM tags WHERE user_id = ${rlsUserId}))`,
        }),
        memberAccess: pgPolicy("task_tags_member_access", {
            as: "permissive",
            for: "all",
            using: sql`(tag_id IN (SELECT id FROM tags WHERE user_id = ${rlsUserId}) AND task_id IN (SELECT id FROM tasks))`,
            withCheck: sql`(tag_id IN (SELECT id FROM tags WHERE user_id = ${rlsUserId}) AND task_id IN (SELECT id FROM tasks))`,
        }),
    }),
).enableRLS();

export const tasksRelations = relations(tasks, ({ many }) => ({
    tags: many(taskTags),
}));

export const taskTagsRelations = relations(taskTags, ({ one }) => ({
    task: one(tasks, {
        fields: [taskTags.taskId],
        references: [tasks.id],
    }),
    tag: one(tags, {
        fields: [taskTags.tagId],
        references: [tags.id],
    }),
}));

export const inboxSections = pgTable(
    "inbox_sections",
    {
        id: id(),
        userId: ownerId(),
        name: text("name").notNull(),
        orderIndex: integer("order_index").notNull().default(0),
        createdAt: createdAt(),
    },
    (table) => ({
        userIdIdx: index("inbox_sections_user_id_idx").on(table.userId),
        rlsPolicy: pgPolicy("inbox_sections_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

export const inboxItems = pgTable(
    "inbox_items",
    {
        id: id(),
        userId: ownerId(),
        sectionId: uuid("section_id").references(() => inboxSections.id, { onDelete: "set null" }),
        orderIndex: integer("order_index").notNull().default(0),
        rawText: text("raw_text").notNull(),
        processed: boolean("processed").default(false).notNull(),
        captureKind: captureKindEnum("capture_kind").default("unknown").notNull(),
        captureStatus: captureStatusEnum("capture_status").default("clarifying").notNull(),
        placedTaskId: uuid("placed_task_id").references(() => tasks.id, { onDelete: "set null" }),
        aiSuggestion: text("ai_suggestion"),
        analysisStatus: analysisStatusEnum("analysis_status").default("pending"),
        analysisVersion: text("analysis_version"),
        analysisSummary: text("analysis_summary"),
        analysis: jsonb("analysis").$type<Record<string, unknown>>(),
        sourceSurface: sourceSurfaceEnum("source_surface").default("inbox"),
        analysisConfidenceTier: confidenceTierEnum("analysis_confidence_tier"),
        analysisNeedsReview: boolean("analysis_needs_review").default(false).notNull(),
        analysisReviewReason: text("analysis_review_reason"),
        analysisEntityCount: integer("analysis_entity_count").default(0).notNull(),
        clarifiedAt: timestamptz("clarified_at"),
        appliedAt: timestamptz("applied_at"),
        createdAt: createdAt(),
    },
    (table) => ({
        userIdIdx: index("inbox_items_user_id_idx").on(table.userId),
        sectionIdIdx: index("inbox_items_section_id_idx").on(table.sectionId),
        placedTaskIdx: index("inbox_items_placed_task_id_idx")
            .on(table.placedTaskId)
            .where(sql`${table.placedTaskId} IS NOT NULL`),
        rlsPolicy: pgPolicy("inbox_items_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

export const habits = pgTable(
    "habits",
    {
        id: id(),
        userId: ownerId(),

        title: text("title").notNull(),
        description: text("description"),

        recurrenceRule: text("recurrence_rule").notNull(),
        targetTime: text("target_time"),
        targetTimes: jsonb("target_times").$type<Record<string, string>>(),

        emoji: text("emoji"),

        reminderEnabled: boolean("reminder_enabled").default(false).notNull(),

        projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),

        sortOrder: doublePrecision("sort_order").default(0).notNull(),

        pausedUntil: date("paused_until", { mode: "string" }),

        totalCompletions: integer("total_completions").default(0).notNull(),
        totalSkips: integer("total_skips").default(0).notNull(),
        currentStreak: integer("current_streak").default(0).notNull(),
        longestStreak: integer("longest_streak").default(0).notNull(),

        colorAccent: text("color_accent").default("lantern").notNull(),

        archived: boolean("archived").default(false).notNull(),

        notes: text("notes"),

        steps: jsonb("steps").$type<Array<{ id: string; title: string }>>(),

        times: jsonb("times").$type<string[]>(),

        linkedAppId: text("linked_app_id"),
        linkedUrl: text("linked_url"),

        shareMode: routineShareModeEnum("share_mode"),
        turnOrder: uuid("turn_order").array(),
        turnsFrom: date("turns_from", { mode: "string" }),

        createdAt: createdAt(),
        updatedAt: timestamptz("updated_at")
            .default(sql`now()`)
            .notNull(),
    },
    (table) => {
        return {
            userIdIdx: index("habits_user_id_idx").on(table.userId),
            projectIdIdx: index("habits_project_id_idx").on(table.projectId),
            linkedUrlCheck: check(
                "habits_linked_url_check",
                sql`linked_url IS NULL OR (linked_url LIKE 'https://%' AND length(linked_url) <= 2048)`,
            ),
            rlsPolicy: pgPolicy("habits_owner_access", {
                as: "permissive",
                for: "all",
                using: rlsUsing,
                withCheck: rlsUsing,
            }),
            memberRead: pgPolicy("habits_member_read", {
                as: "permissive",
                for: "select",
                using: sql`id IN ${memberRoutineView}`,
            }),
            memberUpdate: pgPolicy("habits_member_update", {
                as: "permissive",
                for: "update",
                using: sql`id IN ${memberRoutineEdit}`,
                withCheck: sql`id IN ${memberRoutineEdit}`,
            }),
        };
    },
).enableRLS();

export const routineMembers = pgTable(
    "routine_members",
    {
        habitId: uuid("habit_id")
            .references(() => habits.id, { onDelete: "cascade" })
            .notNull(),
        userId: uuid("user_id")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        role: shareRoleEnum("role").notNull(),
        invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
        reminderEnabled: boolean("reminder_enabled").default(false).notNull(),
        sortOrder: doublePrecision("sort_order").default(0).notNull(),
        pausedUntil: date("paused_until", { mode: "string" }),
        currentStreak: integer("current_streak").default(0).notNull(),
        longestStreak: integer("longest_streak").default(0).notNull(),
        totalCompletions: integer("total_completions").default(0).notNull(),
        totalSkips: integer("total_skips").default(0).notNull(),
        joinedAt: timestamptz("joined_at")
            .default(sql`now()`)
            .notNull(),
    },
    (table) => ({
        pk: primaryKey({ columns: [table.habitId, table.userId] }),
        userIdIdx: index("routine_members_user_id_idx").on(table.userId),
        readPolicy: pgPolicy("routine_members_read", {
            as: "permissive",
            for: "select",
            using: sql`(user_id = ${rlsUserId} OR habit_id IN (SELECT id FROM habits WHERE user_id = ${rlsUserId}) OR habit_id IN ${memberRoutineView})`,
        }),
        ownerUpdate: pgPolicy("routine_members_owner_update", {
            as: "permissive",
            for: "update",
            using: sql`habit_id IN (SELECT id FROM habits WHERE user_id = ${rlsUserId})`,
            withCheck: sql`habit_id IN (SELECT id FROM habits WHERE user_id = ${rlsUserId})`,
        }),
        deletePolicy: pgPolicy("routine_members_delete", {
            as: "permissive",
            for: "delete",
            using: sql`(user_id = ${rlsUserId} OR habit_id IN (SELECT id FROM habits WHERE user_id = ${rlsUserId}))`,
        }),
    }),
).enableRLS();

export const routineCheers = pgTable(
    "routine_cheers",
    {
        id: id(),
        habitId: uuid("habit_id")
            .references(() => habits.id, { onDelete: "cascade" })
            .notNull(),
        fromUserId: uuid("from_user_id")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        toUserId: uuid("to_user_id")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        targetDate: date("target_date", { mode: "string" }).notNull(),
        createdAt: createdAt(),
    },
    (table) => ({
        once: uniqueIndex("routine_cheers_once").on(table.habitId, table.fromUserId, table.toUserId, table.targetDate),
        toUserIdx: index("routine_cheers_to_user_id_idx").on(table.toUserId),
        readPolicy: pgPolicy("routine_cheers_read", {
            as: "permissive",
            for: "select",
            using: sql`(from_user_id = ${rlsUserId} OR to_user_id = ${rlsUserId})`,
        }),
        insertPolicy: pgPolicy("routine_cheers_insert", {
            as: "permissive",
            for: "insert",
            withCheck: sql`(from_user_id = ${rlsUserId} AND habit_id IN (SELECT id FROM habits))`,
        }),
    }),
).enableRLS();

export const habitTags = pgTable(
    "habit_tags",
    {
        id: id(),
        habitId: uuid("habit_id")
            .references(() => habits.id, { onDelete: "cascade" })
            .notNull(),
        tagId: uuid("tag_id")
            .references(() => tags.id, { onDelete: "cascade" })
            .notNull(),
        userId: ownerId(),
    },
    (table) => ({
        uniquePair: uniqueIndex("habit_tags_unique_pair").on(table.habitId, table.tagId),
        tagIdIdx: index("habit_tags_tag_id_idx").on(table.tagId),
        userIdIdx: index("habit_tags_user_id_idx").on(table.userId),
        rlsPolicy: pgPolicy("habit_tags_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

export const habitLogs = pgTable(
    "habit_logs",
    {
        id: id(),
        habitId: uuid("habit_id")
            .references(() => habits.id, { onDelete: "cascade" })
            .notNull(),
        userId: ownerId(),

        status: habitStatusEnum("status").default("PENDING").notNull(),

        targetDate: date("target_date", { mode: "string" }).notNull(),
        completedAt: timestamptz("completed_at"),

        resolvedAt: timestamptz("resolved_at"),

        stepStatus: jsonb("step_status").$type<Record<string, "COMPLETED" | "SKIPPED">>(),

        timeMarks: jsonb("time_marks").$type<Record<string, { status: "COMPLETED" | "SKIPPED"; at: string | null }>>(),

        createdAt: createdAt(),
    },
    (table) => {
        return {
            habitUserDateUnique: uniqueIndex("habit_logs_habit_user_date_unique").on(
                table.habitId,
                table.userId,
                table.targetDate,
            ),
            userIdIdx: index("habit_logs_user_id_idx").on(table.userId),
            rlsPolicy: pgPolicy("habit_logs_owner_access", {
                as: "permissive",
                for: "all",
                using: rlsUsing,
                withCheck: rlsUsing,
            }),
            memberRead: pgPolicy("habit_logs_member_read", {
                as: "permissive",
                for: "select",
                using: sql`(habit_id IN (SELECT id FROM habits WHERE user_id = ${rlsUserId}) OR habit_id IN ${memberRoutineView})`,
            }),
            ownerDelete: pgPolicy("habit_logs_owner_delete", {
                as: "permissive",
                for: "delete",
                using: sql`habit_id IN (SELECT id FROM habits WHERE user_id = ${rlsUserId})`,
            }),
            routineWriteInsert: pgPolicy("habit_logs_routine_write_insert", {
                as: "restrictive",
                for: "insert",
                withCheck: sql`(habit_id IN (SELECT id FROM habits WHERE user_id = ${rlsUserId}) OR habit_id IN ${memberRoutineEdit})`,
            }),
            routineWriteUpdate: pgPolicy("habit_logs_routine_write_update", {
                as: "restrictive",
                for: "update",
                using: sql`true`,
                withCheck: sql`(habit_id IN (SELECT id FROM habits WHERE user_id = ${rlsUserId}) OR habit_id IN ${memberRoutineEdit})`,
            }),
        };
    },
).enableRLS();

const taskInView = sql`task_id IN (SELECT id FROM tasks WHERE project_id IN ${memberView})`;
const taskInEdit = sql`task_id IN (SELECT id FROM tasks WHERE project_id IN ${memberEdit})`;
const taskOwnedEdit = sql`(task_id IN (SELECT id FROM tasks WHERE project_id IN ${memberEdit}) AND user_id = (SELECT t.user_id FROM tasks t WHERE t.id = task_id))`;

export const subtasks = pgTable(
    "subtasks",
    {
        id: id(),
        taskId: uuid("task_id")
            .references(() => tasks.id, { onDelete: "cascade" })
            .notNull(),
        userId: ownerId(),
        title: text("title").notNull(),
        isComplete: boolean("is_complete").default(false).notNull(),
        orderIndex: doublePrecision("order_index").notNull(),
        createdBy: createdBy(),
        createdAt: createdAt(),
    },
    (table) => ({
        taskIdIdx: index("subtasks_task_id_idx").on(table.taskId),
        userIdIdx: index("subtasks_user_id_idx").on(table.userId),
        rlsPolicy: pgPolicy("subtasks_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
        ...sameOwnerAs("subtasks", sameOwnerAsTask),
        memberRead: pgPolicy("subtasks_member_read", {
            as: "permissive",
            for: "select",
            using: taskInView,
        }),
        memberInsert: pgPolicy("subtasks_member_insert", {
            as: "permissive",
            for: "insert",
            withCheck: taskOwnedEdit,
        }),
        memberUpdate: pgPolicy("subtasks_member_update", {
            as: "permissive",
            for: "update",
            using: taskInEdit,
            withCheck: taskOwnedEdit,
        }),
        memberDelete: pgPolicy("subtasks_member_delete", {
            as: "permissive",
            for: "delete",
            using: taskInEdit,
        }),
    }),
).enableRLS();

export const taskNotes = pgTable(
    "task_notes",
    {
        id: id(),
        taskId: uuid("task_id")
            .references(() => tasks.id, { onDelete: "cascade" })
            .notNull(),
        userId: ownerId(),
        body: text("body").default("").notNull(),
        excerpt: text("excerpt").default("").notNull(),
        wordCount: integer("word_count").default(0).notNull(),
        headingCount: integer("heading_count").default(0).notNull(),
        version: integer("version").default(1).notNull(),
        updatedBy: updatedBy(),
        createdAt: createdAt(),
        updatedAt: timestamptz("updated_at")
            .default(sql`now()`)
            .notNull(),
    },
    (table) => ({
        taskIdIdx: uniqueIndex("task_notes_task_id_idx").on(table.taskId),
        userIdIdx: index("task_notes_user_id_idx").on(table.userId),
        rlsPolicy: pgPolicy("task_notes_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
        ...sameOwnerAs("task_notes", sameOwnerAsTask),
        memberRead: pgPolicy("task_notes_member_read", {
            as: "permissive",
            for: "select",
            using: taskInView,
        }),
        memberInsert: pgPolicy("task_notes_member_insert", {
            as: "permissive",
            for: "insert",
            withCheck: taskOwnedEdit,
        }),
        memberUpdate: pgPolicy("task_notes_member_update", {
            as: "permissive",
            for: "update",
            using: taskInEdit,
            withCheck: taskOwnedEdit,
        }),
    }),
).enableRLS();

export const taskMetrics = pgTable(
    "task_metrics",
    {
        id: id(),
        taskId: uuid("task_id")
            .references(() => tasks.id, { onDelete: "cascade" })
            .notNull(),
        userId: ownerId(),
        rescheduleCount: integer("reschedule_count").default(0).notNull(),
        delayCount: integer("delay_count").default(0).notNull(),
        createdToDone: integer("created_to_done"),
        firstScheduled: date("first_scheduled", { mode: "string" }),
        completedAt: timestamptz("completed_at"),
        lastRescheduledAt: timestamptz("last_rescheduled_at"),
        createdAt: createdAt(),
    },
    (table) => ({
        userIdIdx: index("task_metrics_user_id_idx").on(table.userId),
        taskIdUnique: uniqueIndex("task_metrics_task_id_unique").on(table.taskId),
        rlsPolicy: pgPolicy("task_metrics_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();
