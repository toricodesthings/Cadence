import { eq, and } from "drizzle-orm";
import { type CanonicalNlpSnapshot, type ParsedEntity } from "@cadence/nlp";
import { users, projects, tags, taskNlpMetadata, taskNlpMetadataHistory } from "../../db/schema";
import type { Tx } from "../../types/db";

export function confidenceRank(confidence: "high" | "medium" | "low" | undefined) {
    return confidence === "high" ? 2 : confidence === "medium" ? 1 : 0;
}

export function isDateOnlyValue(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function loadNlpRuntime(tx: Tx, userId: string) {
    const [user] = await tx
        .select({ settings: users.settings })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    const [projectRows, tagRows] = await Promise.all([
        tx.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.userId, userId)),
        tx.select({ id: tags.id, name: tags.name }).from(tags).where(eq(tags.userId, userId)),
    ]);

    const settings = (user?.settings ?? {}) as Record<string, any>;
    const intelligence = settings.tasks?.intelligence ?? {};
    const dismissedEntityIds = new Set<string>((intelligence.dismissedEntityIds as string[] | undefined) ?? []);

    return {
        settings,
        context: {
            projects: projectRows,
            tags: tagRows,
        },
        dismissedEntityIds,
    };
}

export function inferTaskFieldsFromParse(
    parsed: CanonicalNlpSnapshot,
    explicit: {
        projectId?: string | null;
        tagIds?: string[];
        priority?: number;
        durationEstimate?: number | null;
        waitingOn?: string | null;
        recurrenceRule?: string | null;
        isAllDay?: boolean | null;
        dueDate?: string | null;
        scheduledDate?: string | null;
        scheduledStart?: string | null;
        scheduledEnd?: string | null;
    },
    confidenceThreshold: "high" | "medium" | "low",
) {
    const thresholdRank = confidenceRank(confidenceThreshold);
    const entityRank = (entity: ParsedEntity) => confidenceRank(entity.confidence);
    const parsedTagIds = new Set<string>();
    let parsedProjectId: string | null | undefined;
    let parsedPriority: number | undefined;
    let parsedDuration: number | null | undefined;
    let parsedWaitingOn: string | null | undefined;
    let parsedRecurrence: string | null | undefined;
    let parsedTemporal:
        | { isAllDay: boolean; dueDate?: string | null; scheduledStart?: string | null; scheduledEnd?: string | null }
        | undefined;
    let parsedScheduledDate: string | null | undefined;

    for (const entity of parsed.entities) {
        if (entityRank(entity) < thresholdRank) continue;

        switch (entity.type) {
            case "project": {
                if (explicit.projectId !== undefined) continue;
                const value = entity.normalizedValue as { resolvedId?: string; id?: string };
                parsedProjectId = value.resolvedId ?? value.id ?? parsedProjectId;
                break;
            }
            case "tag": {
                if (explicit.tagIds !== undefined) continue;
                const value = entity.normalizedValue as { resolvedId?: string; id?: string };
                const tagId = value.resolvedId ?? value.id;
                if (tagId) parsedTagIds.add(tagId);
                break;
            }
            case "priority": {
                if (explicit.priority !== undefined) continue;
                parsedPriority = entity.normalizedValue as number;
                break;
            }
            case "duration": {
                if (explicit.durationEstimate !== undefined) continue;
                const value = entity.normalizedValue as { minutes: number };
                parsedDuration = value.minutes;
                break;
            }
            case "waiting_on": {
                if (explicit.waitingOn !== undefined) continue;
                parsedWaitingOn = entity.normalizedValue as string;
                break;
            }
            case "recurrence": {
                if (explicit.recurrenceRule !== undefined) continue;
                const value = entity.normalizedValue as { rrule: string };
                parsedRecurrence = value.rrule;
                break;
            }
            case "due_date":
            case "scheduled_start": {
                if (
                    explicit.dueDate !== undefined ||
                    explicit.scheduledStart !== undefined ||
                    explicit.scheduledEnd !== undefined ||
                    explicit.isAllDay !== undefined ||
                    explicit.scheduledDate !== undefined
                ) {
                    continue;
                }

                const value = entity.normalizedValue as { date: string; datetime: string | null; hasTime: boolean };
                if (entity.type === "due_date" && value.hasTime) {
                    continue;
                }

                parsedScheduledDate = entity.type === "scheduled_start" && value.datetime ? value.datetime : value.date;

                if (entity.type === "scheduled_start" && value.datetime) {
                    parsedTemporal = { isAllDay: false, scheduledStart: value.datetime };
                } else {
                    parsedTemporal = { isAllDay: true, dueDate: value.date };
                }
                break;
            }
        }
    }

    return {
        projectId: explicit.projectId !== undefined ? explicit.projectId : parsedProjectId,
        tagIds: explicit.tagIds !== undefined ? explicit.tagIds : Array.from(parsedTagIds),
        priority: explicit.priority !== undefined ? explicit.priority : parsedPriority,
        durationEstimate: explicit.durationEstimate !== undefined ? explicit.durationEstimate : parsedDuration,
        waitingOn: explicit.waitingOn !== undefined ? explicit.waitingOn : parsedWaitingOn,
        recurrenceRule: explicit.recurrenceRule !== undefined ? explicit.recurrenceRule : parsedRecurrence,
        isAllDay: explicit.isAllDay !== undefined ? explicit.isAllDay : parsedTemporal?.isAllDay,
        dueDate: explicit.dueDate !== undefined ? explicit.dueDate : parsedTemporal?.dueDate,
        scheduledStart: explicit.scheduledStart !== undefined ? explicit.scheduledStart : parsedTemporal?.scheduledStart,
        scheduledEnd: explicit.scheduledEnd !== undefined ? explicit.scheduledEnd : parsedTemporal?.scheduledEnd,
        scheduledDate: explicit.scheduledDate !== undefined ? explicit.scheduledDate : parsedScheduledDate,
    };
}

export async function persistNlpSnapshot(
    tx: Tx,
    snapshot: CanonicalNlpSnapshot,
    taskId: string,
    userId: string,
) {
    const [existing] = await tx
        .select()
        .from(taskNlpMetadata)
        .where(and(eq(taskNlpMetadata.taskId, taskId), eq(taskNlpMetadata.userId, userId)))
        .limit(1);

    const snapshotRecord = snapshot as unknown as Record<string, unknown>;
    const currentValues = {
        taskId,
        userId,
        parserVersion: snapshot.parserVersion,
        sourceSurface: snapshot.sourceSurface,
        rawInput: snapshot.rawInput,
        cleanedTitle: snapshot.cleanedTitle,
        parseResult: snapshotRecord,
        confidenceTier: snapshot.overallConfidence ?? "medium",
        isCurrent: true,
    };
    const updateValues = {
        parserVersion: snapshot.parserVersion,
        sourceSurface: snapshot.sourceSurface,
        rawInput: snapshot.rawInput,
        cleanedTitle: snapshot.cleanedTitle,
        parseResult: snapshotRecord,
        confidenceTier: snapshot.overallConfidence ?? "medium",
        isCurrent: true,
    };

    if (existing) {
        await tx.insert(taskNlpMetadataHistory).values({
            taskId: existing.taskId,
            userId: existing.userId,
            parserVersion: existing.parserVersion,
            sourceSurface: existing.sourceSurface,
            rawInput: existing.rawInput,
            cleanedTitle: existing.cleanedTitle,
            parseResult: existing.parseResult as unknown as Record<string, unknown>,
            confidenceTier: existing.confidenceTier,
            isCurrent: false,
        });

        const [row] = await tx
            .update(taskNlpMetadata)
            .set(updateValues)
            .where(and(eq(taskNlpMetadata.taskId, taskId), eq(taskNlpMetadata.userId, userId)))
            .returning();
        return row;
    }

    const [row] = await tx.insert(taskNlpMetadata).values(currentValues).returning();
    return row;
}
