import {
    pgTable,
    uuid,
    text,
    timestamp,
    boolean,
    real,
    doublePrecision,
    date,
    integer,
    pgEnum,
    jsonb,
    vector,
    index,
    uniqueIndex,
    pgPolicy,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

/** RLS condition: row belongs to the JWT-authenticated user */
const rlsUsing = sql`(user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)`;

// Settings schema is defined once in the settings domain and imported here.
import { userSettingsSchema, type UserSettings } from '../domains/settings/settings.schema';
export { userSettingsSchema as UserSettingsSchema, type UserSettings };

// === ENUMS ===
export const taskStateEnum = pgEnum('task_state', ['ACTIVE', 'WAITING', 'COMPLETE', 'ARCHIVED']);
export const taskInteractionModeEnum = pgEnum('task_interaction_mode', ['task', 'timetable']);
export const memoryTypeEnum = pgEnum('memory_type', ['CORE', 'EPHEMERAL']);
export const suggestionStatusEnum = pgEnum('suggestion_status', ['PENDING', 'ACCEPTED', 'DISMISSED']);
export const habitStatusEnum = pgEnum('habit_status', ['COMPLETED', 'SKIPPED', 'PENDING']);
export const targetModeEnum = pgEnum('target_mode', ['AMBIENT', 'ANCHOR', 'BLOCK']);
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
export const suggestionTypeEnum = pgEnum('suggestion_type', ['lighten_today', 'suggested_cleanup', 'move_overdue']);
export const focusViewSourceEnum = pgEnum('focus_view_source', ['preset', 'composed', 'manual']);

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
        dateTime: { weekStart: 'Sunday', timezone: 'local', timeDisplay: '12h' },
        calendar: {
            clutter: {
                showAllDay: true,
                showTimedTasks: true,
                showHabitAnchors: true,
            },
            holidays: {
                enabled: true,
                usePreciseLocation: false,
                locationMode: "auto",
                countryCode: null,
                subdivisionCode: null,
                promptDismissedAt: null,
            },
        },
        notifications: { email: true, browser: false, taskReminders: true, habitReminders: true, dueDateAlerts: true },
        shortcuts: {}
    }).notNull(), // User preferences (view mode, theme, etc.)
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => ({
    rlsPolicy: pgPolicy("users_owner_access", {
        as: "permissive",
        for: "all",
        using: sql`(id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)`,
        withCheck: sql`(id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)`,
    }),
})).enableRLS();

// 2. The Adaptive State Engine (Burnout/Stress Tracker)
export const userMetrics = pgTable('user_metrics', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    rescheduleVelocity: real('reschedule_velocity').default(0).notNull(), // Averages how often tasks are pushed back
    currentBurnoutIndex: integer('current_burnout_index').default(10).notNull(), // 1-100 score indicating cognitive load
    completionRatio: real('completion_ratio').default(0).notNull(), // completed / (completed + overdue) over rolling window
    overdueCarryLoad: integer('overdue_carry_load').default(0).notNull(), // number of tasks currently overdue
    habitAdherenceRate: real('habit_adherence_rate').default(0).notNull(), // completed / (completed + skipped) rolling 14 days
    scheduleDensity: real('schedule_density').default(0).notNull(), // avg scheduled minutes per day over 7 days
    lastCalculatedAt: timestamp('last_calculated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
    return {
        userIdIdx: index('user_metrics_user_id_idx').on(table.userId),
        rlsPolicy: pgPolicy("user_metrics_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    };
}).enableRLS();

// 3. AI Memory Layer (Auto-Pruning Context via pgvector RAG)
export const aiMemories = pgTable('ai_memories', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    content: text('content').notNull(), // e.g., "User struggles to focus before 10 AM"
    embedding: vector('embedding', { dimensions: 1536 }), // pgvector for RAG similarity search (dimensions match chosen AI model)
    type: memoryTypeEnum('type').default('EPHEMERAL').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
    return {
        userIdIdx: index('ai_memories_user_id_idx').on(table.userId),
        rlsPolicy: pgPolicy("ai_memories_owner_access", {
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
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    orderIndex: doublePrecision('order_index').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
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
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    colorAccent: text('color_accent').default('luminous-amber'), // Ties strictly to Tailwind CSS Variables
    emoji: text('emoji'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
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
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    sectionId: uuid('section_id').references(() => taskSections.id, { onDelete: 'set null' }),

    // Core Data
    title: text('title').notNull(),
    content: text('content'), // rich text / notes
    state: taskStateEnum('state').default('ACTIVE').notNull(),

    // High-Performance Drag & Drop
    orderIndex: doublePrecision('order_index').notNull(), // Fractional index (1.5, 2.75) for rapid reordering without collision

    // The Calendar Unified Layer
    isAllDay: boolean('is_all_day').default(true).notNull(), // Does it float at the top of the day, or exist in a time block?
    dueDate: timestamp('due_date', { withTimezone: true, mode: 'string' }), // The deadline
    scheduledStart: timestamp('scheduled_start', { withTimezone: true, mode: 'string' }), // e.g. Tuesday at 2 PM
    scheduledEnd: timestamp('scheduled_end', { withTimezone: true, mode: 'string' }), // e.g. Tuesday at 3 PM
    durationEstimate: integer('duration_estimate'), // If unscheduled, how big should the block be when dragged to the calendar? (in minutes)
    timezoneLocked: boolean('timezone_locked').default(false).notNull(), // If TRUE, scheduledStart stays strictly at "3 PM" regardless of user traveling timezones

    // ── Priority System ──
    priority: integer('priority').default(0).notNull(),

    // ── Pin to Top ──
    isPinned: boolean('is_pinned').default(false).notNull(),

    // ── Reminder System ──
    reminderAt: timestamp('reminder_at', { withTimezone: true, mode: 'string' }),
    reminderSilenced: boolean('reminder_silenced').default(false).notNull(),

    // ── Recurrence (iCalendar RRULE) ──
    recurrenceRule: text('recurrence_rule'),
    interactionMode: taskInteractionModeEnum('interaction_mode').default('task').notNull(),

    // ── Additional Task States & Tracking ──
    waitingOn: text('waiting_on'),
    waitingReminder: timestamp('waiting_reminder', { withTimezone: true, mode: 'string' }),
    effort: integer('effort'), // 1=Low, 2=Medium, 3=High, NULL=unset
    notBefore: timestamp('not_before', { withTimezone: true, mode: 'string' }),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
    return {
        userIdIdx: index('tasks_user_id_idx').on(table.userId),
        userStateIdx: index('tasks_user_state_idx').on(table.userId, table.state),
        scheduledStartIdx: index('tasks_scheduled_start_idx').on(table.scheduledStart),
        dueDateIdx: index('tasks_due_date_idx').on(table.dueDate),
        stateIdx: index('tasks_state_idx').on(table.state),
        sortOrderIdx: index('tasks_sort_order_idx').on(table.isPinned, table.orderIndex),
        notBeforeIdx: index('tasks_not_before_idx').on(table.notBefore),
        effortIdx: index('tasks_effort_idx').on(table.effort),
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
    userId: uuid("user_id")
        .references(() => users.id, { onDelete: "cascade" })
        .notNull(),
    name: text("name").notNull(),
    color: text("color").default("default"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
        .defaultNow()
        .notNull(),
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
        using: sql`EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)`,
        withCheck: sql`EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)`,
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
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
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
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
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
    clarifiedAt: timestamp('clarified_at', { withTimezone: true, mode: 'string' }),
    appliedAt: timestamp('applied_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => ({
    userIdIdx: index('inbox_items_user_id_idx').on(table.userId),
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
        userId: uuid('user_id')
            .references(() => users.id, { onDelete: 'cascade' })
            .notNull(),

        // Core Data
        title: text('title').notNull(),
        description: text('description'), // Optional

        // Recurrence & Scheduling
        // Use RRULE standard natively to support "Every Weekday", "Every 3 Days", etc.
        recurrenceRule: text('recurrence_rule').notNull(),
        targetTime: text('target_time'), // e.g., "19:00" string for time-specific habits, null for all-day

        // Presence mode: AMBIENT (default), ANCHOR (has targetTime), BLOCK (reserves schedule time)
        targetMode: targetModeEnum('target_mode').default('AMBIENT').notNull(),

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

        createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
            .defaultNow()
            .notNull(),
    },
    (table) => {
        return {
            userIdIdx: index('habits_user_id_idx').on(table.userId),
            projectIdIdx: index('habits_project_id_idx').on(table.projectId),
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
    userId: uuid("user_id")
        .references(() => users.id, { onDelete: "cascade" })
        .notNull(),
}, (table) => ({
    uniquePair: uniqueIndex("habit_tags_unique_pair").on(table.habitId, table.tagId),
    tagIdIdx: index("habit_tags_tag_id_idx").on(table.tagId),
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
        userId: uuid('user_id')
            .references(() => users.id, { onDelete: 'cascade' })
            .notNull(),

        status: habitStatusEnum('status').default('PENDING').notNull(),

        // The localized day/date the action was due, stored as YYYY-MM-DD
        targetDate: date('target_date', { mode: 'string' }).notNull(),
        completedAt: timestamp('completed_at', {
            withTimezone: true,
            mode: 'string',
        }),

        // Timestamp of last explicit resolution action (complete/skip/clear)
        resolvedAt: timestamp('resolved_at', {
            withTimezone: true,
            mode: 'string',
        }),

        createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
            .defaultNow()
            .notNull(),
    },
    (table) => {
        return {
            habitDateIdx: index('habit_logs_habit_date_idx').on(
                table.habitId,
                table.targetDate,
            ),
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
        userId: uuid("user_id")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        title: text("title").notNull(),
        isComplete: boolean("is_complete").default(false).notNull(),
        orderIndex: doublePrecision("order_index").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
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
        userId: uuid("user_id")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        body: text("body").default("").notNull(),
        excerpt: text("excerpt").default("").notNull(), // First ~120 chars for list previews
        wordCount: integer("word_count").default(0).notNull(),
        headingCount: integer("heading_count").default(0).notNull(),
        version: integer("version").default(1).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
            .defaultNow()
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
        userId: uuid("user_id")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        rescheduleCount: integer("reschedule_count").default(0).notNull(),
        delayCount: integer("delay_count").default(0).notNull(),
        createdToDone: integer("created_to_done"),
        firstScheduled: timestamp("first_scheduled", {
            withTimezone: true,
            mode: "string",
        }),
        completedAt: timestamp("completed_at", {
            withTimezone: true,
            mode: "string",
        }),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
    },
    (table) => ({
        userIdIdx: index("task_metrics_user_id_idx").on(table.userId),
        taskIdIdx: index("task_metrics_task_id_idx").on(table.taskId),
        rlsPolicy: pgPolicy("task_metrics_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

// 13. Usage Events (Lightweight telemetry for AI-readiness)
export const usageEvents = pgTable(
    "usage_events",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        event: text("event").notNull(), // e.g. "task.complete", "task.reschedule", "habit.complete"
        metadata: jsonb("metadata").$type<Record<string, unknown>>(),
        // ── Formalized telemetry contract (§11.3) ──
        surface: text("surface"), // e.g. "today", "schedule", "inbox"
        route: text("route"), // route path at event time
        inputMethod: text("input_method"), // "click", "keyboard", "context_menu", "dnd"
        objectType: text("object_type"), // "task", "habit", "event", "capture", "project"
        confidenceTier: text("confidence_tier"), // "high", "medium", "low" when relevant
        outcome: text("outcome"), // success/failure/cancel
        latencyMs: integer("latency_ms"), // action latency when relevant
        selectionCount: integer("selection_count"), // for batch operations
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
    },
    (table) => ({
        userIdIdx: index("usage_events_user_id_idx").on(table.userId),
        eventIdx: index("usage_events_event_idx").on(table.event),
        createdAtIdx: index("usage_events_created_at_idx").on(table.createdAt),
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
        userId: uuid("user_id")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        objectType: text("object_type").notNull(), // "task" | "habit" | "event"
        objectId: uuid("object_id").notNull(),
        triggerId: text("trigger_id").notNull(), // e.g. "due_date_reminder", "habit_due"
        firstPresentedAt: timestamp("first_presented_at", { withTimezone: true, mode: "string" }),
        lastPresentedAt: timestamp("last_presented_at", { withTimezone: true, mode: "string" }),
        dismissedAt: timestamp("dismissed_at", { withTimezone: true, mode: "string" }),
        deferredUntil: timestamp("deferred_until", { withTimezone: true, mode: "string" }),
        actionTaken: text("action_taken"),
        presentationCount: integer("presentation_count").default(0).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
    },
    (table) => ({
        userObjectTriggerIdx: uniqueIndex("notification_state_user_object_trigger_unique")
            .on(table.userId, table.objectId, table.triggerId),
        userIdIdx: index("notification_state_user_id_idx").on(table.userId),
        deferredUntilIdx: index("notification_state_deferred_until_idx").on(table.deferredUntil),
        rlsPolicy: pgPolicy("notification_state_owner_access", {
            as: "permissive",
            for: "all",
            using: rlsUsing,
            withCheck: rlsUsing,
        }),
    }),
).enableRLS();

// 14. Suggestions (AI-generated advice, never autonomous)
export const suggestions = pgTable(
    "suggestions",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        type: suggestionTypeEnum("type").notNull(),
        title: text("title").notNull(),
        body: text("body"),
        status: suggestionStatusEnum("status").default("PENDING").notNull(),
        relatedTaskIds: jsonb("related_task_ids").$type<string[]>().default([]),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "string" }),
    },
    (table) => ({
        userIdIdx: index("suggestions_user_id_idx").on(table.userId),
        statusIdx: index("suggestions_status_idx").on(table.status),
        rlsPolicy: pgPolicy("suggestions_owner_access", {
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
        userId: uuid("user_id")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        clientMutationId: text("client_mutation_id").notNull(),
        resultId: uuid("result_id"),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
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
        userId: uuid("user_id")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        parserVersion: text("parser_version").default("2.0.0").notNull(),
        sourceSurface: sourceSurfaceEnum("source_surface").default("quick_add").notNull(),
        rawInput: text("raw_input").notNull(),
        cleanedTitle: text("cleaned_title").notNull(),
        parseResult: jsonb("parse_result").$type<Record<string, unknown>>().default({}).notNull(),
        confidenceTier: confidenceTierEnum("confidence_tier").default("medium").notNull(),
        // ── Resolved columns (queryable without unpacking JSON) ──
        resolvedDueDate: timestamp("resolved_due_date", { withTimezone: true, mode: "string" }),
        resolvedScheduledStart: timestamp("resolved_scheduled_start", { withTimezone: true, mode: "string" }),
        resolvedScheduledEnd: timestamp("resolved_scheduled_end", { withTimezone: true, mode: "string" }),
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
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
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

export const taskNlpMetadataHistory = pgTable(
    "task_nlp_metadata_history",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        taskId: uuid("task_id")
            .references(() => tasks.id, { onDelete: "cascade" })
            .notNull(),
        userId: uuid("user_id")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        parserVersion: text("parser_version").default("2.0.0").notNull(),
        sourceSurface: sourceSurfaceEnum("source_surface").default("quick_add").notNull(),
        rawInput: text("raw_input").notNull(),
        cleanedTitle: text("cleaned_title").notNull(),
        parseResult: jsonb("parse_result").$type<Record<string, unknown>>().default({}).notNull(),
        confidenceTier: confidenceTierEnum("confidence_tier").default("medium").notNull(),
        // ── Resolved columns (mirror of task_nlp_metadata) ──
        resolvedDueDate: timestamp("resolved_due_date", { withTimezone: true, mode: "string" }),
        resolvedScheduledStart: timestamp("resolved_scheduled_start", { withTimezone: true, mode: "string" }),
        resolvedScheduledEnd: timestamp("resolved_scheduled_end", { withTimezone: true, mode: "string" }),
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
        isCurrent: boolean("is_current").default(false).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
    },
    (table) => ({
        taskIdIdx: index("task_nlp_metadata_history_task_id_idx").on(table.taskId),
        userIdIdx: index("task_nlp_metadata_history_user_id_idx").on(table.userId),
        rlsPolicy: pgPolicy("task_nlp_metadata_history_owner_access", {
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
        userId: uuid("user_id")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        name: text("name").notNull(),
        definition: jsonb("definition").$type<Record<string, unknown>>().default({}).notNull(),
        isPinned: boolean("is_pinned").default(false).notNull(),
        source: focusViewSourceEnum("source").default("preset").notNull(),
        orderIndex: doublePrecision("order_index").default(0).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
            .defaultNow()
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
