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
    index
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// === ENUMS ===
export const taskStateEnum = pgEnum('task_state', ['ACTIVE', 'WAITING', 'COMPLETE', 'ARCHIVED']);
export const memoryTypeEnum = pgEnum('memory_type', ['CORE', 'EPHEMERAL']);
export const habitStatusEnum = pgEnum('habit_status', ['COMPLETED', 'SKIPPED', 'PENDING']);

// === TABLES ===

// 1. Users (Syncs via Neon Auth Id)
export const users = pgTable('users', {
    id: uuid('id').primaryKey(), // We pass the Neon Auth Sub UUID here
    settings: jsonb('settings').default({}).notNull(), // User preferences (view mode, theme, etc.)
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

// 2. The Adaptive State Engine (Burnout/Stress Tracker)
export const userMetrics = pgTable('user_metrics', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    rescheduleVelocity: real('reschedule_velocity').default(0).notNull(), // Averages how often tasks are pushed back
    currentBurnoutIndex: integer('current_burnout_index').default(10).notNull(), // 1-100 score indicating cognitive load
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

// 4a. Task Sections (User-defined grouping headers)
// In list view these render as collapsible section headers.
// In kanban view each section becomes a column.
export const taskSections = pgTable('task_sections', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    orderIndex: real('order_index').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => ({
    userIdIdx: index('task_sections_user_id_idx').on(table.userId),
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
