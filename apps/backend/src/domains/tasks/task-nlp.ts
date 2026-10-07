import { eq, and } from "drizzle-orm";
import { type CanonicalNlpSnapshot, type ParsedEntity } from "@cadence/nlp";
import { atLocal, isZone, todayIn, wallTimeOf, type Zone } from "@cadence/domain/time";
import { users, projects, tags, taskNlpMetadata } from "../../db/schema";
import type { Tx } from "../../types/db";

function confidenceRank(confidence: "high" | "medium" | "low" | undefined) {
    return confidence === "high" ? 2 : confidence === "medium" ? 1 : 0;
}

export async function loadNlpRuntime(tx: Tx, userId: string) {
    const [user] = await tx
        .select({ settings: users.settings, zone: users.timeZone })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    const zone = isZone(user?.zone) ? user.zone : "UTC";

    const [projectRows, tagRows] = await Promise.all([
        tx.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.userId, userId)),
        tx.select({ id: tags.id, name: tags.name }).from(tags).where(eq(tags.userId, userId)),
    ]);

    const settings = (user?.settings ?? {}) as Record<string, any>;
    const intelligence = settings.tasks?.intelligence ?? {};
    const dismissedEntityIds = new Set<string>((intelligence.dismissedEntityIds as string[] | undefined) ?? []);

    const weekStart = (settings.dateTime?.weekStart ?? "Sunday") as "Sunday" | "Monday" | "Saturday";

    return {
        settings,
        zone,
        // The user's today and clock, from their zone: the parser never reads the machine's.
        clock: { today: todayIn(zone), now: wallTimeOf(new Date(), zone), weekStart },
        context: {
            projects: projectRows,
            tags: tagRows,
        },
        dismissedEntityIds,
    };
}

/**
 * What the parse adds to a task, in the stored shapes (`zone` is the user's): a date alone is a day
 * (`dueDate`), a date with a time is a timed start (`atLocal`). A deadline is a day, so a time on a
 * "due" date is dropped. Anything the caller sent explicitly wins.
 */
export function inferTaskFieldsFromParse(
    parsed: CanonicalNlpSnapshot,
    explicit: {
        projectId?: string | null;
        tagIds?: string[];
        priority?: number;
        durationEstimate?: number | null;
        waitingOn?: string | null;
        recurrenceRule?: string | null;
        /** Any of these given (even null) means the caller placed the task itself. */
        dueDate?: string | null;
        scheduledStart?: string | null;
        scheduledEnd?: string | null;
        scheduledDay?: string | null;
    },
    confidenceThreshold: "high" | "medium" | "low",
    zone: Zone,
) {
    const thresholdRank = confidenceRank(confidenceThreshold);
    const entityRank = (entity: ParsedEntity) => confidenceRank(entity.confidence);
    const parsedTagIds = new Set<string>();
    let parsedProjectId: string | null | undefined;
    let parsedPriority: number | undefined;
    let parsedDuration: number | null | undefined;
    let parsedWaitingOn: string | null | undefined;
    let parsedRecurrence: string | null | undefined;
    let parsedTemporal: { dueDate?: string; scheduledStart?: string } | undefined;

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
                parsedWaitingOn = (entity.normalizedValue as { person: string }).person;
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
                    explicit.scheduledDay !== undefined
                ) {
                    continue;
                }

                const value = entity.normalizedValue as { date: string; time: string | null; hasTime: boolean };
                parsedTemporal = entity.type === "scheduled_start" && value.hasTime && value.time
                    ? { scheduledStart: atLocal(value.date, value.time, zone) }
                    : { dueDate: value.date };
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
        dueDate: explicit.dueDate !== undefined ? explicit.dueDate : parsedTemporal?.dueDate,
        scheduledStart: explicit.scheduledStart !== undefined ? explicit.scheduledStart : parsedTemporal?.scheduledStart,
        scheduledEnd: explicit.scheduledEnd,
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
