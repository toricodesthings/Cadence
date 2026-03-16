import {
    pgTable,
    uuid,
    text,
    timestamp,
    boolean,
    real,
    integer,
    pgEnum,
    jsonb,
    vector,
    index,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { z } from 'zod';

export const UserSettingsSchema = z.object({
    profile: z.object({
        pronouns: z.string().optional(),
    }).optional(),
    appearance: z.object({
        theme: z.enum(["twilight", "daylight", "system"]),
        accentIntensity: z.enum(["soft", "balanced", "vivid"]),
        motion: z.enum(["system", "full", "reduced"]),
        density: z.enum(["comfortable", "compact"]),
    }).optional(),
    notifications: z.object({
        email: z.boolean(),
        browser: z.boolean().optional(),
        taskReminders: z.boolean().optional(),
        habitReminders: z.boolean().optional(),
        dueDateAlerts: z.boolean().optional(),
        quietHoursEnabled: z.boolean().optional(),
        quietHoursStart: z.string().nullable().optional(),
        quietHoursEnd: z.string().nullable().optional(),
    }),
    dateTime: z.object({
        weekStart: z.enum(['Sunday', 'Monday', 'Saturday']),
        timezone: z.string(),
        timeDisplay: z.enum(['12h', '24h']),
        dateStyle: z.enum(['mdy', 'dmy', 'ymd']).optional(),
    }),
    calendar: z.object({
        defaultView: z.enum(["month", "week", "day"]).optional(),
        showWeekNumbers: z.boolean().optional(),
        showWeekends: z.boolean().optional(),
        holidays: z.object({
            enabled: z.boolean(),
            usePreciseLocation: z.boolean(),
            locationMode: z.enum(["auto", "manual"]),
            countryCode: z.string().nullable(),
            subdivisionCode: z.string().nullable(),
            promptDismissedAt: z.string().nullable(),
        }),
    }),
    tasks: z.object({
        defaultDueDate: z.enum(['None', 'Today', 'Tomorrow', 'Next Week']).nullable(),
        defaultView: z.enum(["list", "kanban"]).optional(),
        defaultPriority: z.enum(["none", "low", "medium", "high", "urgent"]).optional(),
        defaultDurationMinutes: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.literal(90)]).nullable().optional(),
        newTaskPlacement: z.enum(["top", "bottom"]).optional(),
        openDetailOnCreate: z.boolean().optional(),
        hideTrash: z.boolean(),
        hideCompleted: z.boolean(),
        showDoneCelebration: z.boolean().optional(),
    }),
    shortcuts: z.object({
        enabled: z.boolean().optional(),
        showHints: z.boolean().optional(),
        bindings: z.object({
            commandPalette: z.string().optional(),
            newTask: z.string().optional(),
            focusSearch: z.string().optional(),
            toggleView: z.string().optional(),
            completeTask: z.string().optional(),
            archiveTask: z.string().optional(),
        }).optional(),
    }).optional(),
    integrations: z.object({
        googleCalendar: z.object({
            enabled: z.boolean(),
            syncMode: z.enum(["one_way", "two_way"]),
            includeCompleted: z.boolean().optional(),
        }).optional(),
        appleCalendar: z.object({
            enabled: z.boolean(),
            syncMode: z.enum(["one_way", "two_way"]),
        }).optional(),
        notion: z.object({
            enabled: z.boolean(),
            createBacklinks: z.boolean(),
        }).optional(),
        obsidian: z.object({
            enabled: z.boolean(),
            appendTaskLinks: z.boolean(),
        }).optional(),
        ics: z.object({
            enabled: z.boolean(),
            includeHabits: z.boolean(),
        }).optional(),
    }).optional(),
    privacy: z.object({
        usageDiagnostics: z.boolean(),
        crashReports: z.boolean(),
        storeRecentSearches: z.boolean(),
        storeDismissedPrompts: z.boolean(),
        exportFormat: z.enum(["json", "csv"]),
        lastExportRequestedAt: z.string().nullable().optional(),
    }).optional(),
    // Legacy — kept for backward compat during migration
    preferredView: z.enum(['list', 'kanban']).optional(),
});

export type UserSettings = z.infer<typeof UserSettingsSchema>;

// === ENUMS ===
export const taskStateEnum = pgEnum('task_state', ['ACTIVE', 'WAITING', 'COMPLETE', 'ARCHIVED']);
export const taskInteractionModeEnum = pgEnum('task_interaction_mode', ['task', 'timetable']);
export const memoryTypeEnum = pgEnum('memory_type', ['CORE', 'EPHEMERAL']);
export const suggestionStatusEnum = pgEnum('suggestion_status', ['PENDING', 'ACCEPTED', 'DISMISSED']);
export const habitStatusEnum = pgEnum('habit_status', ['COMPLETED', 'SKIPPED', 'PENDING']);

// === TABLES ===

// 1. Users (Syncs via Neon Auth Id)
export const users = pgTable('users', {
    id: uuid('id').primaryKey(), // We pass the Neon Auth Sub UUID here
    settings: jsonb('settings').$type<UserSettings>().default({
        tasks: { defaultDueDate: null, hideTrash: false, hideCompleted: false },
        dateTime: { weekStart: 'Sunday', timezone: 'local', timeDisplay: '12h' },
        calendar: {
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
});

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
    };
});

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
    };
});

// 4a. Task Sections (User-defined grouping headers, scoped to a project)
// In kanban view each section becomes a column.
export const taskSections = pgTable('task_sections', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    orderIndex: real('order_index').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => ({
    userIdIdx: index('task_sections_user_id_idx').on(table.userId),
    projectIdIdx: index('task_sections_project_id_idx').on(table.projectId),
}));

// 5. Projects (Task Containers)
export const projects = pgTable('projects', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    colorAccent: text('color_accent').default('luminous-amber'), // Ties strictly to Tailwind CSS Variables
    emoji: text('emoji'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

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
    orderIndex: real('order_index').notNull(), // Fractional index (1.5, 2.75) for rapid reordering without collision

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
        scheduledStartIdx: index('tasks_scheduled_start_idx').on(table.scheduledStart),
        dueDateIdx: index('tasks_due_date_idx').on(table.dueDate),
        stateIdx: index('tasks_state_idx').on(table.state),
        sortOrderIdx: index('tasks_sort_order_idx').on(table.isPinned, table.orderIndex),
        notBeforeIdx: index('tasks_not_before_idx').on(table.notBefore),
        effortIdx: index('tasks_effort_idx').on(table.effort),
    };
});

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
});

// 7. Task–Tag associations (many-to-many)
export const taskTags = pgTable("task_tags", {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
        .references(() => tasks.id, { onDelete: "cascade" })
        .notNull(),
    tagId: uuid("tag_id")
        .references(() => tags.id, { onDelete: "cascade" })
        .notNull(),
});

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
});

export const inboxItems = pgTable('inbox_items', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    sectionId: uuid('section_id').references(() => inboxSections.id, { onDelete: 'set null' }),
    orderIndex: integer('order_index').notNull().default(0),
    rawText: text('raw_text').notNull(), // The messy input "Call mom tmrw at 4"
    processed: boolean('processed').default(false).notNull(), // Has the Cloudflare AI Queue converted this into a structured Task yet?
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

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

        // Reminders
        reminderEnabled: boolean('reminder_enabled').default(false).notNull(),

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
        };
    },
);

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

        // The localized day/date the action was due, truncated to YYYY-MM-DD for consistency
        targetDate: timestamp('target_date', {
            withTimezone: true,
            mode: 'string',
        }).notNull(),
        completedAt: timestamp('completed_at', {
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
        };
    },
);

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
        orderIndex: real("order_index").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
    },
    (table) => ({
        taskIdIdx: index("subtasks_task_id_idx").on(table.taskId),
        userIdIdx: index("subtasks_user_id_idx").on(table.userId),
    }),
);

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
    }),
);

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
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
    },
    (table) => ({
        userIdIdx: index("usage_events_user_id_idx").on(table.userId),
        eventIdx: index("usage_events_event_idx").on(table.event),
        createdAtIdx: index("usage_events_created_at_idx").on(table.createdAt),
    }),
);

// 14. Suggestions (AI-generated advice, never autonomous)
export const suggestions = pgTable(
    "suggestions",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        type: text("type").notNull(), // e.g. "lighten_today", "suggested_cleanup", "move_overdue"
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
    }),
);

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
    }),
);
