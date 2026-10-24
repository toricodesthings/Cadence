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
    check,
    pgPolicy,
} from 'drizzle-orm/pg-core';
import { userSettingsSchema, type UserSettings } from "@cadence/contracts/settings";
import { relations, sql } from 'drizzle-orm';
import { createdAt, timestamptz, rlsUserId, rlsUsing } from "./columns";

// Settings schema is defined once in the settings domain and imported here.
export { userSettingsSchema as UserSettingsSchema, type UserSettings };

// === ENUMS ===
export const taskStateEnum = pgEnum('task_state', ['ACTIVE', 'WAITING', 'COMPLETE', 'ARCHIVED']);
export const taskInteractionModeEnum = pgEnum('task_interaction_mode', ['task', 'timetable']);
export const memoryKindEnum = pgEnum('memory_kind', ['preference', 'quirk', 'life', 'constraint', 'pattern', 'duration', 'assist']);
export const memorySourceEnum = pgEnum('memory_source', ['explicit', 'chat', 'note', 'activity', 'backfill']);
export const memoryConfidenceEnum = pgEnum('memory_confidence', ['stated', 'observed', 'inferred']);
export const memoryStatusEnum = pgEnum('memory_status', ['active', 'forgotten']);
// `duration` is unused since 0023 (reports live in duration_reports); Postgres can't cheaply drop an enum value.
export const memorySignalKindEnum = pgEnum('memory_signal_kind', ['reschedule', 'complete', 'routine', 'duration']);
export const habitStatusEnum = pgEnum('habit_status', ['COMPLETED', 'SKIPPED', 'PENDING']);
export const captureKindEnum = pgEnum('capture_kind', ['task', 'thought', 'reference', 'unknown']);
export const captureStatusEnum = pgEnum('capture_status', ['clarifying', 'placed', 'kept', 'discarded']);
export const analysisStatusEnum = pgEnum('analysis_status', ['pending', 'parsed', 'reviewed', 'applied', 'dismissed']);
export const confidenceTierEnum = pgEnum('confidence_tier', ['high', 'medium', 'low']);
export const sourceSurfaceEnum = pgEnum('source_surface', [
    'inline_add', 'quick_add',
    'holding_capture', 'holding_clarify', 'clarify_sheet',
    'task_edit_title', 'task_edit_note', 'focus_view_composer',
    'inbox_card', 'inbox',
]);
export const focusViewSourceEnum = pgEnum('focus_view_source', ['preset', 'composed', 'manual']);

// AI assistant enums (see docs/ai_upgrade 08 — persistence)
export const aiMessageRoleEnum = pgEnum('ai_message_role', ['user', 'assistant', 'system']);
export const aiMessageStatusEnum = pgEnum('ai_message_status', ['streaming', 'complete', 'failed', 'aborted']);


// === TABLES ===

// 1. Users (Syncs via Neon Auth Id)
export const users = pgTable('users', {
    id: uuid('id').primaryKey(), // We pass the Neon Auth Sub UUID here
    settings: jsonb('settings').$type<UserSettings>().default({
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
        dateTime: { weekStart: 'Sunday', timezone: 'device', timeDisplay: '12h' },
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
        notifications: { email: true, browser: false, taskReminders: true, habitReminders: true, dueDateAlerts: true },
        shortcuts: {}
    }).notNull(), // User preferences (view mode, theme, etc.)
    // The user's IANA zone: the only source every server path reads (`userZone`). The client keeps it
    // equal to the device's zone unless settings pin one. 'UTC' until the first client sync.
    timeZone: text('time_zone').default('UTC').notNull(),
    createdAt: createdAt(),
}, () => ({
    rlsPolicy: pgPolicy("users_owner_access", {
        as: "permissive",
        for: "all",
        using: sql`(id = ${rlsUserId})`,
        withCheck: sql`(id = ${rlsUserId})`,
    }),
})).enableRLS();

/** The owning user; their rows go when the account does. */
export const ownerId = () => uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull();

// 2. The Adaptive State Engine (Burnout/Stress Tracker)
export const userMetrics = pgTable('user_metrics', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: ownerId(),
    rescheduleVelocity: real('reschedule_velocity').default(0).notNull(), // Averages how often tasks are pushed back
    currentBurnoutIndex: integer('current_burnout_index'), // 1-100 score indicating cognitive load; NULL = not enough evidence to say
    completionRatio: real('completion_ratio').default(0).notNull(), // completed / (completed + overdue) over rolling window
    overdueCarryLoad: integer('overdue_carry_load').default(0).notNull(), // number of tasks currently overdue
    habitAdherenceRate: real('habit_adherence_rate').default(0).notNull(), // completed / (completed + skipped) rolling 14 days
    scheduleDensity: real('schedule_density').default(0).notNull(), // avg scheduled minutes per day over 7 days
    lastCalculatedAt: timestamptz('last_calculated_at').default(sql`now()`).notNull(),
}, (table) => {
    return {
        userIdIdx: uniqueIndex('user_metrics_user_id_unique').on(table.userId),
        rlsPolicy: pgPolicy("user_metrics_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    };
}).enableRLS();


// 4a. Task Sections (User-defined grouping headers, scoped to a project)
// In kanban view each section becomes a column.
export const taskSections = pgTable('task_sections', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: ownerId(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    orderIndex: doublePrecision('order_index').notNull(),
    createdAt: createdAt(),
}, (table) => ({
    userIdIdx: index('task_sections_user_id_idx').on(table.userId),
    projectIdIdx: index('task_sections_project_id_idx').on(table.projectId),
    rlsPolicy: pgPolicy("task_sections_owner_access", {
        as: "permissive",
        for: "all",
        using: rlsUsing,
        withCheck: rlsUsing,
    }),
})).enableRLS();

// 5. Projects (Task Containers)
export const projects = pgTable('projects', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: ownerId(),
    name: text('name').notNull(),
    colorAccent: text('color_accent').default('luminous-amber'), // Ties strictly to Tailwind CSS Variables
    emoji: text('emoji'),
    createdAt: createdAt(),
}, (table) => ({
    userIdIdx: index('projects_user_id_idx').on(table.userId),
    rlsPolicy: pgPolicy("projects_owner_access", {
        as: "permissive",
        for: "all",
        using: rlsUsing,
        withCheck: rlsUsing,
    }),
})).enableRLS();

// 5. Tasks (Unified Events & To-Dos)
export const tasks = pgTable('tasks', {
    origin: text('origin', { enum: ['thought'] }),
    id: uuid('id').defaultRandom().primaryKey(),
    userId: ownerId(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    sectionId: uuid('section_id').references(() => taskSections.id, { onDelete: 'set null' }),

    // Core Data
    title: text('title').notNull(),
    content: text('content'), // rich text / notes
    state: taskStateEnum('state').default('ACTIVE').notNull(),

    // High-Performance Drag & Drop
    orderIndex: doublePrecision('order_index').notNull(), // Fractional index (1.5, 2.75) for rapid reordering without collision

    // The Calendar Unified Layer: a day (LocalDate) or a timed block (Instants + the zone it was planned in).
    // All-day = no scheduled_start.
    dueDate: date('due_on', { mode: 'string' }), // The day an all-day task sits on, or its deadline
    endDate: date('end_on', { mode: 'string' }), // Inclusive last day of an all-day multi-day task
    scheduledStart: timestamptz('scheduled_start'), // Timed only, e.g. Tuesday at 2 PM
    scheduledEnd: timestamptz('scheduled_end'), // Timed only, e.g. Tuesday at 3 PM
    zone: text('zone'), // The zone a timed task was planned in; repeating series expand in it
    durationEstimate: integer('duration_estimate'), // If unscheduled, how big should the block be when dragged to the calendar? (in minutes)
    timezoneLocked: boolean('timezone_locked').default(false).notNull(), // If TRUE, scheduledStart stays strictly at "3 PM" regardless of user traveling timezones

    // ── Priority System ──
    priority: integer('priority').default(0).notNull(),

    // ── Pin to Top ──
    isPinned: boolean('is_pinned').default(false).notNull(),

    // ── Reminder System ──
    reminderAt: timestamptz('reminder_at'),
    reminderSilenced: boolean('reminder_silenced').default(false).notNull(),

    // ── Recurrence (iCalendar RRULE) ──
    recurrenceRule: text('recurrence_rule'),
    interactionMode: taskInteractionModeEnum('interaction_mode').default('task').notNull(),

    // ── Additional Task States & Tracking ──
    waitingOn: text('waiting_on'),
    waitingReminder: timestamptz('waiting_reminder'),
    effort: integer('effort'), // 1=Low, 2=Medium, 3=High, NULL=unset
    // Who chose `effort`: only a person's own choice ('manual'), or a suggestion they accepted ('accepted'), can inform
    // later suggestions. NULL = unknown (the assistant, an import, a copy, or a value from before this was recorded).
    effortOrigin: text('effort_origin'),
    effortChosenAt: timestamptz('effort_chosen_at'),
    // A guess is never `effort`. 'model' = the decision model's score from this person's own choices (`effort_guess` set);
    // 'dismissed' = they said no, kept until the title or list changes. Cleared when `effort` is set or the title/list changes.
    effortGuess: integer('effort_guess'),
    effortGuessSource: text('effort_guess_source'),
    effortGuessAt: timestamptz('effort_guess_at'),
    notBefore: date('hidden_until', { mode: 'string' }), // Hidden until this day
    linkedAppId: text('linked_app_id'), // The one app this task opens (a frontend catalogue id); never a URL
    linkedUrl: text('linked_url'), // Or the one website it opens: a normalised https URL (contracts `parseWebsite`)
    // The moment the task entered Done: set by a trigger with the state, kept while Done, NULL otherwise. With the task id it
    // names one completion, which is what a "how long did it take?" answer belongs to.
    completedAt: timestamptz('completed_at'),

    createdAt: createdAt(),
    updatedAt: timestamptz('updated_at').default(sql`now()`).notNull(),
}, (table) => {
    return {
        // Every read is one user's: lists in manual order, Done/Trash newest first, date windows.
        userListIdx: index('tasks_user_list_idx').on(table.userId, table.state, table.isPinned.desc().nullsFirst(), table.orderIndex),
        userUpdatedIdx: index('tasks_user_updated_idx').on(table.userId, table.state, table.updatedAt, table.id),
        userDueIdx: index('tasks_user_due_idx').on(table.userId, table.dueDate),
        userStartIdx: index('tasks_user_start_idx').on(table.userId, table.scheduledStart),
        userSeriesIdx: index('tasks_user_series_idx').on(table.userId).where(sql`${table.recurrenceRule} IS NOT NULL`),
        // The cron's overdue sweep across all users.
        overdueIdx: index('tasks_overdue_idx').on(table.dueDate).where(sql`${table.state} = 'ACTIVE'`),
        projectIdIdx: index('tasks_project_id_idx').on(table.projectId),
        sectionIdIdx: index('tasks_section_id_idx').on(table.sectionId),
        linkedUrlCheck: check('tasks_linked_url_check', sql`linked_url IS NULL OR (linked_url LIKE 'https://%' AND length(linked_url) <= 2048)`),
        completedAtCheck: check('tasks_completed_at_check', sql`(state = 'COMPLETE') = (completed_at IS NOT NULL)`),
        effortCheck: check('tasks_effort_check', sql`effort IS NULL OR effort BETWEEN 1 AND 3`),
        effortOriginCheck: check('tasks_effort_origin_check', sql`effort_origin IS NULL OR (effort IS NOT NULL AND effort_origin IN ('manual', 'accepted'))`),
        effortGuessCheck: check('tasks_effort_guess_check', sql`effort_guess IS NULL OR effort_guess BETWEEN 1 AND 3`),
        effortGuessSourceCheck: check('tasks_effort_guess_source_check', sql`effort_guess_source IS NULL OR effort_guess_source IN ('model', 'dismissed')`),
        // The evidence read: one account's own recorded choices, newest first.
        userEffortIdx: index('tasks_user_effort_idx').on(table.userId, table.effortChosenAt.desc()).where(sql`${table.effortOrigin} IS NOT NULL`),
        timedHasZoneCheck: check('tasks_timed_zone_check', sql`scheduled_start IS NULL OR zone IS NOT NULL`),
        noEndWithoutStartCheck: check('tasks_end_needs_start_check', sql`scheduled_start IS NOT NULL OR scheduled_end IS NULL`),
        endOnCheck: check('tasks_end_on_check', sql`end_on IS NULL OR (due_on IS NOT NULL AND end_on >= due_on)`),
        timedNoEndOnCheck: check('tasks_timed_end_on_check', sql`scheduled_start IS NULL OR end_on IS NULL`),
        rlsPolicy: pgPolicy("tasks_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    };
}).enableRLS();

// 6. Tags (User-defined labels)
export const tags = pgTable("tags", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: ownerId(),
    name: text("name").notNull(),
    color: text("color").default("default"),
    createdAt: createdAt(),
}, (table) => ({
    userIdIdx: index("tags_user_id_idx").on(table.userId),
    rlsPolicy: pgPolicy("tags_owner_access", {
        as: "permissive",
        for: "all",
        using: rlsUsing,
        withCheck: rlsUsing,
    }),
})).enableRLS();

// 7. Task–Tag associations (many-to-many)
export const taskTags = pgTable("task_tags", {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
        .references(() => tasks.id, { onDelete: "cascade" })
        .notNull(),
    tagId: uuid("tag_id")
        .references(() => tags.id, { onDelete: "cascade" })
        .notNull(),
}, (table) => ({
    uniquePair: uniqueIndex("task_tags_unique_pair").on(table.taskId, table.tagId),
    tagIdIdx: index("task_tags_tag_id_idx").on(table.tagId),
    rlsPolicy: pgPolicy("task_tags_owner_access", {
        as: "permissive",
        for: "all",
        using: sql`EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = ${rlsUserId})`,
        withCheck: sql`EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = ${rlsUserId})`,
    }),
})).enableRLS();

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

// 8. Asynchronous Inbox Dumps (Webhooks, Siri, Background processing)
export const inboxSections = pgTable('inbox_sections', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: ownerId(),
    name: text('name').notNull(),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: createdAt(),
}, (table) => ({
    userIdIdx: index('inbox_sections_user_id_idx').on(table.userId),
    rlsPolicy: pgPolicy("inbox_sections_owner_access", {
        as: "permissive",
        for: "all",
        using: rlsUsing,
        withCheck: rlsUsing,
    }),
})).enableRLS();

export const inboxItems = pgTable('inbox_items', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: ownerId(),
    sectionId: uuid('section_id').references(() => inboxSections.id, { onDelete: 'set null' }),
    orderIndex: integer('order_index').notNull().default(0),
    rawText: text('raw_text').notNull(), // The messy input "Call mom tmrw at 4"
    processed: boolean('processed').default(false).notNull(), // Has the Cloudflare AI Queue converted this into a structured Task yet?
    captureKind: captureKindEnum('capture_kind').default('unknown').notNull(),
    captureStatus: captureStatusEnum('capture_status').default('clarifying').notNull(),
    placedTaskId: uuid('placed_task_id').references(() => tasks.id, { onDelete: 'set null' }), // Link to task created from this capture
    aiSuggestion: text('ai_suggestion'), // JSON string — AI-suggested classification, scheduling, etc.
    // NLP analysis columns
    analysisStatus: analysisStatusEnum('analysis_status').default('pending'),
    analysisVersion: text('analysis_version'), // parser version at analysis time
    analysisSummary: text('analysis_summary'), // "Cadence understood: ..." human-readable summary
    analysis: jsonb('analysis').$type<Record<string, unknown>>(), // full ParseResult JSON
    sourceSurface: sourceSurfaceEnum('source_surface').default('inbox'),
    // ── Analysis lifecycle (§11.3) ──
    analysisConfidenceTier: confidenceTierEnum('analysis_confidence_tier'),
    analysisNeedsReview: boolean('analysis_needs_review').default(false).notNull(),
    analysisReviewReason: text('analysis_review_reason'),
    analysisEntityCount: integer('analysis_entity_count').default(0).notNull(),
    clarifiedAt: timestamptz('clarified_at'),
    appliedAt: timestamptz('applied_at'),
    createdAt: createdAt(),
}, (table) => ({
    userIdIdx: index('inbox_items_user_id_idx').on(table.userId),
    sectionIdIdx: index('inbox_items_section_id_idx').on(table.sectionId),
    placedTaskIdx: index('inbox_items_placed_task_id_idx').on(table.placedTaskId).where(sql`${table.placedTaskId} IS NOT NULL`),
    rlsPolicy: pgPolicy("inbox_items_owner_access", {
        as: "permissive",
        for: "all",
        using: rlsUsing,
        withCheck: rlsUsing,
    }),
})).enableRLS();

// 9. Habits
export const habits = pgTable(
    'habits',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: ownerId(),

        // Core Data
        title: text('title').notNull(),
        description: text('description'), // Optional

        // Recurrence & Scheduling
        // Use RRULE standard natively to support "Every Weekday", "Every 3 Days", etc.
        recurrenceRule: text('recurrence_rule').notNull(),
        targetTime: text('target_time'), // e.g., "19:00" string for time-specific habits, null for all-day
        // Per-weekday overrides of targetTime, keyed by RRULE day ("MO".."SU") → "HH:mm"
        targetTimes: jsonb('target_times').$type<Record<string, string>>(),

        emoji: text('emoji'),

        // Reminders
        reminderEnabled: boolean('reminder_enabled').default(false).notNull(),

        // Project linkage (optional)
        projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),

        // Ordering
        sortOrder: doublePrecision('sort_order').default(0).notNull(),

        // Pause support
        pausedUntil: date('paused_until', { mode: 'string' }),

        // Tracking Metrics (Calculated server-side iteratively to avoid expensive COUNT(*) queries)
        totalCompletions: integer('total_completions').default(0).notNull(),
        totalSkips: integer('total_skips').default(0).notNull(),
        currentStreak: integer('current_streak').default(0).notNull(),
        longestStreak: integer('longest_streak').default(0).notNull(),

        // UI Identity
        colorAccent: text('color_accent').default('lantern').notNull(), // Ties to Tailwind: text-lantern, ext.

        // Archiving
        archived: boolean('archived').default(false).notNull(),

        // User-authored notes for this habit
        notes: text('notes'),

        // Ordered steps ("water → stretch → journal"); null for a single-act routine
        steps: jsonb('steps').$type<Array<{ id: string; title: string }>>(),

        // A routine at set times: its daily "HH:mm" times, ascending; null = the usual targetTime
        times: jsonb('times').$type<string[]>(),

        // The one app this routine opens (a frontend catalogue id); never a URL
        linkedAppId: text('linked_app_id'),
        // Or the one website it opens: a normalised https URL (contracts `parseWebsite`)
        linkedUrl: text('linked_url'),

        createdAt: createdAt(),
        updatedAt: timestamptz('updated_at')
            .default(sql`now()`)
            .notNull(),
    },
    (table) => {
        return {
            userIdIdx: index('habits_user_id_idx').on(table.userId),
            projectIdIdx: index('habits_project_id_idx').on(table.projectId),
            linkedUrlCheck: check('habits_linked_url_check', sql`linked_url IS NULL OR (linked_url LIKE 'https://%' AND length(linked_url) <= 2048)`),
            rlsPolicy: pgPolicy("habits_owner_access", {
                as: "permissive",
                for: "all",
                using: rlsUsing,
                withCheck: rlsUsing,
            }),
        };
    },
).enableRLS();

// 9b. Habit–Tag associations (many-to-many)
export const habitTags = pgTable("habit_tags", {
    id: uuid("id").defaultRandom().primaryKey(),
    habitId: uuid("habit_id")
        .references(() => habits.id, { onDelete: "cascade" })
        .notNull(),
    tagId: uuid("tag_id")
        .references(() => tags.id, { onDelete: "cascade" })
        .notNull(),
    userId: ownerId(),
}, (table) => ({
    uniquePair: uniqueIndex("habit_tags_unique_pair").on(table.habitId, table.tagId),
    tagIdIdx: index("habit_tags_tag_id_idx").on(table.tagId),
    userIdIdx: index("habit_tags_user_id_idx").on(table.userId),
    rlsPolicy: pgPolicy("habit_tags_owner_access", {
        as: "permissive",
        for: "all",
        using: rlsUsing,
        withCheck: rlsUsing,
    }),
})).enableRLS();

// 10. Habit Logs
// Explicitly tracks the historical interaction with a habit on a given target date.
export const habitLogs = pgTable(
    'habit_logs',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        habitId: uuid('habit_id')
            .references(() => habits.id, { onDelete: 'cascade' })
            .notNull(),
        userId: ownerId(),

        status: habitStatusEnum('status').default('PENDING').notNull(),

        // The localized day/date the action was due, stored as YYYY-MM-DD
        targetDate: date('target_date', { mode: 'string' }).notNull(),
        completedAt: timestamptz('completed_at'),

        // Timestamp of last explicit resolution action (complete/skip/clear)
        resolvedAt: timestamptz('resolved_at'),

        // Step id → COMPLETED/SKIPPED for routines with steps; a partial day stays PENDING
        stepStatus: jsonb('step_status').$type<Record<string, "COMPLETED" | "SKIPPED">>(),

        // "HH:mm" → { status, at } for a routine at set times; the day's status follows from these
        timeMarks: jsonb('time_marks').$type<Record<string, { status: "COMPLETED" | "SKIPPED"; at: string | null }>>(),

        createdAt: createdAt(),
    },
    (table) => {
        return {
            habitDateUnique: uniqueIndex('habit_logs_habit_date_unique').on(
                table.habitId,
                table.targetDate,
            ),
            userIdIdx: index('habit_logs_user_id_idx').on(table.userId),
            rlsPolicy: pgPolicy("habit_logs_owner_access", {
                as: "permissive",
                for: "all",
                using: rlsUsing,
                withCheck: rlsUsing,
            }),
        };
    },
).enableRLS();

// 11. Subtasks
export const subtasks = pgTable(
    "subtasks",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        taskId: uuid("task_id")
            .references(() => tasks.id, { onDelete: "cascade" })
            .notNull(),
        userId: ownerId(),
        title: text("title").notNull(),
        isComplete: boolean("is_complete").default(false).notNull(),
        orderIndex: doublePrecision("order_index").notNull(),
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
    }),
).enableRLS();

// 11b. Task Notes (Dedicated note storage — separate from tasks.content for lazy loading)
export const taskNotes = pgTable(
    "task_notes",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        taskId: uuid("task_id")
            .references(() => tasks.id, { onDelete: "cascade" })
            .notNull(),
        userId: ownerId(),
        body: text("body").default("").notNull(),
        excerpt: text("excerpt").default("").notNull(), // First ~120 chars for list previews
        wordCount: integer("word_count").default(0).notNull(),
        headingCount: integer("heading_count").default(0).notNull(),
        version: integer("version").default(1).notNull(),
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
    }),
).enableRLS();

// 12. Task Metrics (Silent Tracking)
export const taskMetrics = pgTable(
    "task_metrics",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        taskId: uuid("task_id")
            .references(() => tasks.id, { onDelete: "cascade" })
            .notNull(),
        userId: ownerId(),
        rescheduleCount: integer("reschedule_count").default(0).notNull(),
        delayCount: integer("delay_count").default(0).notNull(),
        createdToDone: integer("created_to_done"),
        firstScheduled: date("first_scheduled", { mode: "string" }), // the day the task was first rescheduled to
        completedAt: timestamptz("completed_at"),
        // When it was last rescheduled: the workload window reads this, not the row's creation time.
        lastRescheduledAt: timestamptz("last_rescheduled_at"),
        createdAt: createdAt(),
    },
    (table) => ({
        userIdIdx: index("task_metrics_user_id_idx").on(table.userId),
        // One metrics row per task, so metric writes are single upserts.
        taskIdUnique: uniqueIndex("task_metrics_task_id_unique").on(table.taskId),
        rlsPolicy: pgPolicy("task_metrics_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();
