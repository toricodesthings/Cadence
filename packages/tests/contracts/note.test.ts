import { describe, expect, it } from "vitest";
import { NOTE_MAX_CHARS, upsertNoteSchema } from "@cadence/contracts/note";

describe("upsertNoteSchema", () => {
    it("accepts NOTE_MAX_CHARS characters and rejects one more", () => {
        expect(upsertNoteSchema.safeParse({ body: "x".repeat(NOTE_MAX_CHARS) }).success).toBe(true);
        expect(upsertNoteSchema.safeParse({ body: "x".repeat(NOTE_MAX_CHARS + 1) }).success).toBe(false);
    });
});
