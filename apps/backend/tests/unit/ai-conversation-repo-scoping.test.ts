/**
 * Owner-scoping guards on the DESTRUCTIVE conversation-repo helpers.
 *
 * These three run raw DELETE/UPDATE driven by client-supplied ids (the edit /
 * regenerate flows), so the property that matters is the WHERE clause: every
 * statement must be scoped to the owning user + conversation, and an unknown
 * anchor must be a no-op rather than a broad delete. There is no test DB here,
 * so we assert the generated SQL via a drizzle mock driver.
 */
import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import {
    truncateMessagesAfter,
    deleteAllMessages,
    setTitleIfEmpty,
} from "../../src/domains/ai/persistence/conversation-repo";
import type { Tx } from "../../src/types/db";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONV_ID = "22222222-2222-4222-8222-222222222222";

/**
 * A tx stand-in that records the SQL each statement WOULD run. Chain shapes
 * mirror the ones the repo uses; `selectRows` seeds the anchor lookup.
 */
function createFakeTx(selectRows: unknown[] = []) {
    const mock = (drizzle as any).mock();
    const captured: { sql: string; params: unknown[] }[] = [];

    const tx = {
        select: () => ({
            from: () => ({
                where: () => ({
                    limit: () => Promise.resolve(selectRows),
                }),
            }),
        }),
        delete: (table: unknown) => ({
            where: (cond: unknown) => {
                captured.push(mock.delete(table).where(cond).toSQL());
                return Promise.resolve();
            },
        }),
        update: (table: unknown) => ({
            set: (values: unknown) => ({
                where: (cond: unknown) => {
                    captured.push(mock.update(table).set(values).where(cond).toSQL());
                    return Promise.resolve();
                },
            }),
        }),
    } as unknown as Tx;

    return { tx, captured };
}

describe("conversation-repo destructive helpers are owner-scoped", () => {
    it("deleteAllMessages scopes the DELETE to the owner AND the conversation", async () => {
        const { tx, captured } = createFakeTx();

        await deleteAllMessages(tx, USER_ID, CONV_ID);

        expect(captured).toHaveLength(1);
        expect(captured[0].sql).toContain('delete from "ai_messages"');
        expect(captured[0].sql).toContain('"conversation_id" = $');
        expect(captured[0].sql).toContain('"user_id" = $');
        expect(captured[0].params).toEqual([CONV_ID, USER_ID]);
    });

    it("truncateMessagesAfter deletes only rows ordered after the anchor, owner-scoped", async () => {
        const { tx, captured } = createFakeTx([{ orderIndex: 40 }]);

        const found = await truncateMessagesAfter(tx, USER_ID, CONV_ID, "msg-anchor");

        expect(found).toBe(true);
        expect(captured).toHaveLength(1);
        expect(captured[0].sql).toContain('delete from "ai_messages"');
        expect(captured[0].sql).toContain('"order_index" > $');
        expect(captured[0].params).toEqual([CONV_ID, USER_ID, 40]);
    });

    it("truncateMessagesAfter is a NO-OP when the anchor id is unknown (never a broad delete)", async () => {
        const { tx, captured } = createFakeTx([]); // anchor lookup finds nothing

        const found = await truncateMessagesAfter(tx, USER_ID, CONV_ID, "does-not-exist");

        expect(found).toBe(false);
        expect(captured).toHaveLength(0);
    });

    it("setTitleIfEmpty only writes when the title is still null (never clobbers a rename)", async () => {
        const { tx, captured } = createFakeTx();

        await setTitleIfEmpty(tx, USER_ID, CONV_ID, "Plan The Week");

        expect(captured).toHaveLength(1);
        expect(captured[0].sql).toContain('update "ai_conversations"');
        expect(captured[0].sql).toContain('"title" is null');
        expect(captured[0].sql).toContain('"user_id" = $');
        expect(captured[0].params).toContain(CONV_ID);
        expect(captured[0].params).toContain(USER_ID);
        expect(captured[0].params).toContain("Plan The Week");
    });
});
