import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { and, ilike, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { taskNotes, tasks, subtasks, taskTags, tags, projects, taskSections } from "../../db/schema";

import { searchTerms, isIdentifier, identifierPattern, processTerm, canApproximate } from "@cadence/search/terms";

const qualified = (column: AnyPgColumn) => sql`${column.table}.${sql.identifier(column.name)}`;

export const taskPlaceColumns = {
    listName: sql<
        string | null
    >`(select ${qualified(projects.name)} from ${projects} where ${qualified(projects.id)} = ${qualified(tasks.projectId)})`,
    sectionName: sql<
        string | null
    >`(select ${qualified(taskSections.name)} from ${taskSections} where ${qualified(taskSections.id)} = ${qualified(tasks.sectionId)})`,
};

export const taskSearchColumns = {
    notes: sql<string>`coalesce((select ${qualified(taskNotes.body)} from ${taskNotes} where ${qualified(taskNotes.taskId)} = ${qualified(tasks.id)}), ${qualified(tasks.content)}, '')`,
    subtasks: sql<string>`coalesce((select string_agg(${qualified(subtasks.title)}, ' ') from ${subtasks} where ${qualified(subtasks.taskId)} = ${qualified(tasks.id)}), '')`,
    tags: sql<string>`coalesce((select string_agg(${qualified(tags.name)}, ' ') from ${taskTags} join ${tags} on ${qualified(taskTags.tagId)} = ${qualified(tags.id)} where ${qualified(taskTags.taskId)} = ${qualified(tasks.id)}), '')`,
};

function matchesTerm(column: SQLWrapper, term: string, fuzzy: boolean): SQL {
    if (isIdentifier(term)) {
        return sql`${column} ~* ${identifierPattern(term)}`;
    }
    if (/^[a-z]+$/i.test(term)) {
        return or(
            sql`${column} ~* ${`\\m${term}([[:digit:]]+[[:alpha:]]*)?\\M`}`,
            sql`to_tsvector('english', coalesce(${column}, '')) @@ plainto_tsquery('english', ${term})`,
            fuzzy && canApproximate(term) ? sql`word_similarity(${term}, coalesce(${column}, '')) >= 0.2` : undefined,
            term.length >= 4
                ? sql`${column} ~* ${`\\m${processTerm(term).slice(0, Math.max(3, processTerm(term).length - 2))}[[:alpha:]]*\\M`}`
                : undefined,
        )!;
    }
    return ilike(sql`${column}`, `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
}

const MAX_SEARCH_TERMS = 8;

export function taskSearch(query: string, places: SQLWrapper[], fuzzy = false) {
    const terms = searchTerms(query).slice(0, MAX_SEARCH_TERMS);
    const match = (term: string) =>
        or(
            ...[tasks.title, ...Object.values(taskSearchColumns), ...places].map((column) =>
                matchesTerm(column, term, fuzzy),
            ),
        );
    return {
        condition: terms.length ? and(...terms.map(match))! : sql`false`,
        identifiers: terms.length ? and(...terms.filter(isIdentifier).map(match)) : sql`false`,
    };
}
