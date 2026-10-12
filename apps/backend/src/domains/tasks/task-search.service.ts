import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { and, ilike, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { taskNotes, tasks, subtasks, taskTags, tags, projects, taskSections } from "../../db/schema";

import { searchTerms, isIdentifier, identifierPattern, processTerm, canApproximate } from "@cadence/search/terms";

// Drizzle removes column qualification in a single-table SELECT. Correlated subqueries must retain it.
const qualified = (column: AnyPgColumn) => sql`${column.table}.${sql.identifier(column.name)}`;

export const taskPlaceColumns = {
    listName: sql<string | null>`(select ${qualified(projects.name)} from ${projects} where ${qualified(projects.id)} = ${qualified(tasks.projectId)})`,
    sectionName: sql<string | null>`(select ${qualified(taskSections.name)} from ${taskSections} where ${qualified(taskSections.id)} = ${qualified(tasks.sectionId)})`,
};

/** Canonical notes replace legacy content, including an intentionally empty note. */
export const taskSearchColumns = {
    notes: sql<string>`coalesce((select ${qualified(taskNotes.body)} from ${taskNotes} where ${qualified(taskNotes.taskId)} = ${qualified(tasks.id)}), ${qualified(tasks.content)}, '')`,
    subtasks: sql<string>`coalesce((select string_agg(${qualified(subtasks.title)}, ' ') from ${subtasks} where ${qualified(subtasks.taskId)} = ${qualified(tasks.id)}), '')`,
    tags: sql<string>`coalesce((select string_agg(${qualified(tags.name)}, ' ') from ${taskTags} join ${tags} on ${qualified(taskTags.tagId)} = ${qualified(tags.id)} where ${qualified(taskTags.taskId)} = ${qualified(tasks.id)}), '')`,
};

/** Numbers/codes are literal identities, never stems or substring guesses. */
function matchesTerm(column: SQLWrapper, term: string, fuzzy: boolean): SQL {
    if (isIdentifier(term)) {
        return sql`${column} ~* ${identifierPattern(term)}`;
    }
    if (/^[a-z]+$/i.test(term)) {
        // Whole words and their forms, not accidental substrings (rent ≠ parent).
        // Keep course-prefix recall: "comp assignment" can find COMP3005 Assignment 1.
        return or(
            sql`${column} ~* ${`\\m${term}([[:digit:]]+[[:alpha:]]*)?\\M`}`,
            sql`to_tsvector('english', coalesce(${column}, '')) @@ plainto_tsquery('english', ${term})`,
            fuzzy && canApproximate(term) ? sql`word_similarity(${term}, coalesce(${column}, '')) >= 0.2` : undefined,
            // A broad candidate prefix only: the shared index verifies full word forms before returning anything.
            sql`${column} ~* ${`\\m${processTerm(term).slice(0, Math.max(1, processTerm(term).length - 2))}[[:alpha:]]*\\M`}`,
        )!;
    }
    // Non-word text, including LIKE wildcards, stays literal.
    return ilike(sql`${column}`, `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
}

/** All terms must match the same task. Reuse the identifier subset when offering a fuzzy suggestion. */
export function taskSearch(query: string, places: SQLWrapper[], fuzzy = false) {
    const terms = searchTerms(query);
    const match = (term: string) => or(
        ...[tasks.title, ...Object.values(taskSearchColumns), ...places].map((column) => matchesTerm(column, term, fuzzy)),
    );
    return {
        condition: terms.length ? and(...terms.map(match))! : sql`false`,
        identifiers: terms.length ? and(...terms.filter(isIdentifier).map(match)) : sql`false`,
    };
}
