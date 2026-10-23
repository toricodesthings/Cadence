import { eq, and } from "drizzle-orm";
import { type CanonicalNlpSnapshot } from "@cadence/nlp";
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
    const found = readEntities(parsed, confidenceThreshold, zone);
    // Any placement field given (even null) means the caller placed the task itself.
    const placed = [explicit.dueDate, explicit.scheduledStart, explicit.scheduledEnd, explicit.scheduledDay]
        .some((field) => field !== undefined);
    const temporal = placed ? undefined : found.temporal;
    return {
        projectId: given(explicit.projectId, found.projectId),
        tagIds: given(explicit.tagIds, Array.from(found.tagIds)),
        priority: given(explicit.priority, found.priority),
        durationEstimate: given(explicit.durationEstimate, found.duration),
        waitingOn: given(explicit.waitingOn, found.waitingOn),
        recurrenceRule: given(explicit.recurrenceRule, found.recurrence),
        dueDate: given(explicit.dueDate, temporal?.dueDate),
        scheduledStart: given(explicit.scheduledStart, temporal?.scheduledStart),
        scheduledEnd: explicit.scheduledEnd,
    };
}

/** Every confident entity the parse found, in stored shapes; a later one of a kind replaces an earlier one. */
function readEntities(parsed: CanonicalNlpSnapshot, confidenceThreshold: "high" | "medium" | "low", zone: Zone) {
    const thresholdRank = confidenceRank(confidenceThreshold);
    const found: {
        tagIds: Set<string>;
        projectId?: string | null;
        priority?: number;
        duration?: number | null;
        waitingOn?: string | null;
        recurrence?: string | null;
        temporal?: { dueDate?: string; scheduledStart?: string };
    } = { tagIds: new Set<string>() };
    for (const entity of parsed.entities) {
        if (confidenceRank(entity.confidence) < thresholdRank) continue;
        const value = entity.normalizedValue as Record<string, unknown>;
        switch (entity.type) {
            case "project":
                found.projectId = idOf(value) ?? found.projectId;
                break;
            case "tag": {
                const tagId = idOf(value);
                if (tagId) found.tagIds.add(tagId);
                break;
            }
            case "priority": found.priority = entity.normalizedValue as number; break;
            case "duration": found.duration = value.minutes as number; break;
            case "waiting_on": found.waitingOn = value.person as string; break;
            case "recurrence": found.recurrence = value.rrule as string; break;
            case "due_date":
            case "scheduled_start":
                found.temporal = temporalOf(entity.type, value, zone);
                break;
        }
    }
    return found;
}

const idOf = (value: Record<string, unknown>) => (value.resolvedId ?? value.id) as string | undefined;

/** A date alone is a day; a scheduled date with a time is a timed start. */
function temporalOf(type: "due_date" | "scheduled_start", value: Record<string, unknown>, zone: Zone) {
    const { date, time, hasTime } = value as { date: string; time: string | null; hasTime: boolean };
    return type === "scheduled_start" && hasTime && time
        ? { scheduledStart: atLocal(date, time, zone) }
        : { dueDate: date };
}

/** An explicit value, even null, wins over a parsed one. */
function given<T, P>(explicit: T | undefined, parsed: P): T | P {
    return explicit !== undefined ? explicit : parsed;
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
    const updateValues = {
        parserVersion: snapshot.parserVersion,
        sourceSurface: snapshot.sourceSurface,
        rawInput: snapshot.rawInput,
        cleanedTitle: snapshot.cleanedTitle,
        parseResult: snapshotRecord,
        confidenceTier: snapshot.overallConfidence ?? "medium",
        isCurrent: true,
    };
    const currentValues = { taskId, userId, ...updateValues };

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
