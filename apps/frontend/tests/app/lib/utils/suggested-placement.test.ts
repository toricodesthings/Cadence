import { expect, it } from "vitest";
import type { InboxItem } from "@cadence/contracts/inbox";
import { placementFor } from "../../../../app/lib/utils/task/suggested-placement";

const uni = "10000000-0000-4000-8000-0000000000a1";
const sec = "10000000-0000-4000-8000-0000000000b1";
const work = "10000000-0000-4000-8000-0000000000a2";
const suggestedPlacement = { projectId: uni, sectionId: sec, model: "m", probability: 0.95 };
const item = (analysis: Record<string, unknown> | null) => ({ id: "c", analysis }) as InboxItem;

it("uses the stored suggestion, the user's pick over it, and nothing once they picked None", () => {
    expect(placementFor(item(null))).toBeNull();
    expect(placementFor(item({ suggestedPlacement }))).toEqual({ projectId: uni, sectionId: sec });
    expect(placementFor(item({ suggestedPlacement, userOverrides: { projectId: work } }))).toEqual({ projectId: work, sectionId: null });
    expect(placementFor(item({ suggestedPlacement, userOverrides: { projectId: null } }))).toBeNull();
    expect(placementFor(item({ suggestedPlacement: { projectId: "nope" } }))).toBeNull();
});

it("puts a cue word's list over the suggestion, keeping the suggested section only for its own list", () => {
    expect(placementFor(item({ suggestedPlacement }), { cue: work })).toEqual({ projectId: work, sectionId: null });
    expect(placementFor(item({ suggestedPlacement }), { cue: uni })).toEqual({ projectId: uni, sectionId: sec });
    expect(placementFor(item({ suggestedPlacement, userOverrides: { projectId: null } }), { cue: work })).toBeNull();
    // A section picked in Clarify, on the suggested list.
    expect(placementFor(item({ suggestedPlacement, userOverrides: { sectionId: null } }))).toEqual({ projectId: uni, sectionId: null });
    // Clarify keeps the suggestion it opened with.
    expect(placementFor(item(null), { suggestion: suggestedPlacement })).toEqual({ projectId: uni, sectionId: sec });
});
