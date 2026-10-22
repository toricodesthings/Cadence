// Drizzle schema, the source of truth: tables, enums, indexes, RLS policies and relations.
// core: users, lists, tasks, inbox, routines · ai: memory, chats, images, connections · ops: diagnostics, reminders, dedup, NLP, views, exports.
export * from "./schema/core";
export * from "./schema/ai";
export * from "./schema/ops";
