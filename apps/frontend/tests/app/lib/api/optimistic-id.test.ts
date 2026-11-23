import { describe, expect, it } from "vitest";
import { clientIdFor, newRowId } from "../../../../app/lib/api/optimistic-id";

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newRowId", () => {
    it("is a UUIDv7 carrying its millisecond", () => {
        const at = Date.UTC(2026, 10, 22, 12, 0, 0, 123);
        const id = newRowId(at);

        expect(id).toMatch(UUID_V7);
        expect(parseInt(id.replace(/-/g, "").slice(0, 12), 16)).toBe(at);
    });

    it("sorts by creation time", () => {
        const ids = [3, 1, 2].map((s) => newRowId(Date.UTC(2026, 0, 1, 0, 0, s)));

        expect([...ids].sort()).toEqual([ids[1], ids[2], ids[0]]);
    });

    it("is what a create sends when the input has no id", () => {
        expect(clientIdFor({ title: "x" })).toMatch(UUID_V7);
    });
});
