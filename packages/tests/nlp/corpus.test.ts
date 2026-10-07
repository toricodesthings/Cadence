import { describe, expect, it } from "vitest";
import { parse } from "@cadence/nlp";
import { resolveDraft, EMPTY_DRAFT_FIELDS, type DraftField, type DraftFields } from "@cadence/domain/nlp-draft";
import { CLOCK, CONTEXT, CORPUS, ZONE, type Case, type Fields, type Surface } from "./corpus";

const CAPS: Record<Surface, ReadonlySet<DraftField>> = {
    task: new Set<DraftField>(["dueDate", "scheduledStart", "scheduledEnd", "recurrenceRule", "priority", "projectId", "tagIds", "waitingOn", "durationMinutes", "notBefore", "reminderAt"]),
    routine: new Set<DraftField>(["recurrenceRule", "timeOfDay", "projectId", "tagIds"]),
    event: new Set<DraftField>(["dueDate"]),
};
const KEYS = Object.keys(EMPTY_DRAFT_FIELDS) as Array<keyof DraftFields>;
const empty = (v: unknown) => v === null || v === 0 || (Array.isArray(v) && v.length === 0);

function run(c: Case) {
    const r = parse({ input: c.text, sourceSurface: "inline_add", clock: CLOCK, context: CONTEXT });
    return resolveDraft(c.text, r.entities, {}, { zone: ZONE, capabilities: CAPS[c.surface], monthDayOnly: c.surface === "event" });
}

/** Does the applied value equal what the case expects (events compare only the month and day)? */
function same(c: Case, key: keyof DraftFields, got: unknown, want: unknown) {
    if (c.surface === "event" && key === "dueDate") return typeof got === "string" && got.endsWith(want as string);
    return JSON.stringify(got) === JSON.stringify(want);
}

function score(cases: Case[]) {
    let applied = 0, correct = 0, complete = 0;
    const failures: string[] = [];
    for (const c of cases) {
        const d = run(c);
        let ok = d.title === c.title;
        const why: string[] = d.title === c.title ? [] : [`title "${d.title}"`];
        for (const key of KEYS) {
            const got = (d.fields as unknown as Record<string, unknown>)[key];
            const want = (c.fields as Record<string, unknown>)[key];
            if (!empty(got)) {
                applied++;
                if (want !== undefined && same(c, key, got, want)) correct++;
                else { ok = false; why.push(`${key}=${JSON.stringify(got)} (wanted ${JSON.stringify(want)})`); }
            } else if (want !== undefined) { ok = false; why.push(`missing ${key}`); }
        }
        if (ok) complete++;
        else failures.push(`${c.id} ⟶ ${c.text} :: ${why.join("; ")}`);
    }
    return { total: cases.length, applied, correct, complete, failures, precision: applied ? correct / applied : 1, completion: cases.length ? complete / cases.length : 1 };
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const heldOut = CORPUS.filter((c) => c.split === "held-out");
const supported = (c: Case) => !c.negative;

describe("corpus shape", () => {
    it("meets the plan's size and coverage minimums", () => {
        expect(CORPUS.length).toBeGreaterThanOrEqual(300);
        expect(CORPUS.filter((c) => c.negative).length).toBeGreaterThanOrEqual(50);
        expect(CORPUS.filter((c) => c.combined).length).toBeGreaterThanOrEqual(50);
        expect(heldOut.length).toBeGreaterThanOrEqual(100);
        // Families never straddle the split.
        const splits = new Map<string, Set<string>>();
        for (const c of CORPUS) splits.set(c.family, (splits.get(c.family) ?? new Set()).add(c.split));
        expect([...splits.values()].every((s) => s.size === 1)).toBe(true);
    });
});

describe("outcomes, held-out and overall", () => {
    it("reports accepted-field precision and completion", () => {
        const all = score(CORPUS);
        const held = score(heldOut);
        const single = score(CORPUS.filter((c) => supported(c) && !c.combined && c.surface === "task"));
        const combined = score(CORPUS.filter((c) => c.combined));
        const negatives = score(CORPUS.filter((c) => c.negative));
        const routines = score(heldOut.filter((c) => c.surface === "routine"));
        const events = score(heldOut.filter((c) => c.surface === "event"));
        const report = `precision all ${all.correct}/${all.applied} ${pct(all.precision)}; held-out ${held.correct}/${held.applied} ${pct(held.precision)}; single ${single.complete}/${single.total} ${pct(single.completion)}; combined ${combined.complete}/${combined.total} ${pct(combined.completion)}; negatives ${negatives.complete}/${negatives.total}; held-out routine ${routines.total}, events ${events.total}`;
        console.info(report);
        const failed = [...all.failures];
        expect(failed, `${report}\n${failed.join("\n")}`).toEqual([]);
    });
});
