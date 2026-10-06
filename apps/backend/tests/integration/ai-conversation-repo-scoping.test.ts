/**
 * Owner-scoping guards on the DESTRUCTIVE conversation-repo helpers.
 *
 * These three run raw DELETE/UPDATE driven by client-supplied ids (the edit /
 * regenerate flows), so the property that matters is the WHERE clause: every
 * statement must be scoped to the owning user + conversation, and an unknown
 * anchor must be a no-op rather than a broad delete. The helpers run as the
 * table owner (RLS bypassed), so only their own WHERE clauses protect the rows.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asOwner, createUser, getTestDb, startTestDb } from "../helpers/db";
import {
    appendUserMessage,
    resolveOrCreateConversation,
    truncateMessagesAfter,
    deleteAllMessages,
    setTitleIfEmpty,
} from "../../src/domains/ai/persistence/conversation-repo";
import { withRls } from "../../src/platform/rls";
import type { Tx } from "../../src/types/db";

let owner: string;
let other: string;

beforeAll(startTestDb);
beforeEach(async () => {
    owner = await createUser();
    other = await createUser();
});

/** A thread holding user turns `${id}-1` … `${id}-n`, in order. */
async function seedThread(userId: string, turns = 3) {
    return withRls(getTestDb(), userId, async (tx) => {
        const { id } = await resolveOrCreateConversation(tx, userId, {});
        for (let i = 1; i <= turns; i++) {
            await appendUserMessage(tx, userId, id, { id: `${id}-${i}`, role: "user", parts: [{ type: "text", text: `turn ${i}` }] }, {});
        }
        return id;
    });
}

const bypassingRls = <T>(fn: (tx: Tx) => Promise<T>) => asOwner(() => fn(getTestDb()));

async function messageIds(conversationId: string) {
    const { rows } = await asOwner((pg) =>
        pg.query<{ id: string }>("SELECT id FROM ai_messages WHERE conversation_id = $1 ORDER BY order_index", [conversationId]),
    );
    return rows.map((r) => r.id);
}

async function title(conversationId: string) {
    const { rows } = await asOwner((pg) => pg.query<{ title: string | null }>("SELECT title FROM ai_conversations WHERE id = $1", [conversationId]));
    return rows[0].title;
}

describe("conversation-repo destructive helpers are owner-scoped", () => {
    it("deleteAllMessages empties only the owner's named conversation", async () => {
        const target = await seedThread(owner);
        const sibling = await seedThread(owner);

        await bypassingRls((tx) => deleteAllMessages(tx, other, target));
        expect(await messageIds(target)).toHaveLength(3);

        await bypassingRls((tx) => deleteAllMessages(tx, owner, target));
        expect(await messageIds(target)).toEqual([]);
        expect(await messageIds(sibling)).toHaveLength(3);
    });

    it("truncateMessagesAfter deletes only rows ordered after the anchor", async () => {
        const conv = await seedThread(owner);

        expect(await bypassingRls((tx) => truncateMessagesAfter(tx, owner, conv, `${conv}-1`))).toBe(true);
        expect(await messageIds(conv)).toEqual([`${conv}-1`]);
    });

    it("truncateMessagesAfter is a NO-OP for an unknown anchor or another user (never a broad delete)", async () => {
        const conv = await seedThread(owner);

        expect(await bypassingRls((tx) => truncateMessagesAfter(tx, owner, conv, "does-not-exist"))).toBe(false);
        expect(await bypassingRls((tx) => truncateMessagesAfter(tx, other, conv, `${conv}-1`))).toBe(false);
        expect(await messageIds(conv)).toHaveLength(3);
    });

    it("setTitleIfEmpty only writes the owner's untitled conversation (never clobbers a rename)", async () => {
        const conv = await seedThread(owner, 0);

        await bypassingRls((tx) => setTitleIfEmpty(tx, other, conv, "Hijack"));
        expect(await title(conv)).toBeNull();

        await bypassingRls((tx) => setTitleIfEmpty(tx, owner, conv, "Plan The Week"));
        await bypassingRls((tx) => setTitleIfEmpty(tx, owner, conv, "Second Title"));
        expect(await title(conv)).toBe("Plan The Week");
    });
});
