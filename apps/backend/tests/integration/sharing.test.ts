import { beforeAll, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, startTestDb } from "../helpers/db";
import { tokenOf } from "../helpers/sharing";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { shareRoleEnum } from "../../src/db/schema";
import { searchRoutes } from "../../src/domains/decisions/search.route";
import { noteRoutes } from "../../src/domains/notes/notes.route";
import { projectRoutes } from "../../src/domains/projects/projects.route";
import { sectionRoutes } from "../../src/domains/sections/sections.route";
import { sharingRoutes } from "../../src/domains/sharing/sharing.route";
import { subtaskRoutes } from "../../src/domains/subtasks/subtasks.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";
import { shareRoleSchema } from "@cadence/contracts/sharing";

beforeAll(startTestDb);

/** An owner with a list called "Our House", and a way to act as anyone on the sharing routes. */
async function house() {
    const owner = await createUser({ name: "Ada", image: "data:image/png;base64,AAAA" });
    const list = (await apiAs(owner, "/projects", projectRoutes)("POST", "", { name: "Our House", emoji: "🏠" })).body
        .data;
    const as = (userId: string) => apiAs(userId, "/lists", sharingRoutes);
    const link = async () => (await as(owner)("POST", `/${list.id}/invites`)).body.data.url as string;
    const join = async (userId: string, url?: string) =>
        as(userId)("POST", "/join", { token: tokenOf(url ?? (await link())) });
    return { owner, list, as, link, join };
}

it("keeps the TypeScript roles in the database enum's order", () => {
    expect(shareRoleEnum.enumValues).toEqual(shareRoleSchema.options);
});

describe("invite links", () => {
    it("mints a 7-day link and stores only its hash", async () => {
        const { owner, list, as } = await house();
        const { status, body } = await as(owner)("POST", `/${list.id}/invites`);
        expect(status).toBe(201);
        expect(body.data.url).toMatch(/^https:\/\/dashboard\.cadenceapp\.cloud\/join\/[A-Za-z0-9_-]{43}$/);
        const days = (Date.parse(body.data.expiresAt) - Date.now()) / 86_400_000;
        expect(days).toBeGreaterThan(6.9);
        expect(days).toBeLessThanOrEqual(7);
        const stored = await asOwner(
            async (pg) =>
                (await pg.query<any>("SELECT token_hash FROM share_invites WHERE list_id = $1", [list.id])).rows,
        );
        expect(stored).toHaveLength(1);
        expect(stored[0].token_hash).not.toContain(tokenOf(body.data.url));
    });

    it("lets only the owner mint, and answers a stranger as if the list weren't there", async () => {
        const { list, as, join } = await house();
        const member = await createUser();
        await join(member);
        expect((await as(member)("POST", `/${list.id}/invites`)).status).toBe(403);
        expect((await as(await createUser())("POST", `/${list.id}/invites`)).status).toBe(404);
    });

    it("keeps earlier links working when another is minted, until Reset links", async () => {
        const { owner, list, as, link, join } = await house();
        const first = await link();
        await link();
        expect((await join(await createUser(), first)).status).toBe(200);
        expect((await as(owner)("DELETE", `/${list.id}/invites`)).status).toBe(200);
        const late = await join(await createUser(), first);
        expect(late.status).toBe(410);
        expect(late.body.error.code).toBe("LINK_EXPIRED");
    });

    it("stops an expired link, and prunes expired rows when minting", async () => {
        const { list, owner, as, link, join } = await house();
        const url = await link();
        await asOwner((pg) => pg.query("UPDATE share_invites SET expires_at = now() - interval '1 minute'"));
        expect((await join(await createUser(), url)).status).toBe(410);
        expect((await as(await createUser())("GET", `/invite-preview?token=${tokenOf(url)}`)).status).toBe(410);
        await as(owner)("POST", `/${list.id}/invites`);
        const rows = await asOwner(
            async (pg) => (await pg.query("SELECT 1 FROM share_invites WHERE list_id = $1", [list.id])).rows,
        );
        expect(rows).toHaveLength(1);
    });

    it("refuses a malformed or unknown token", async () => {
        const { as } = await house();
        const me = await createUser();
        expect((await as(me)("POST", "/join", { token: "nope" })).status).toBe(400);
        expect((await as(me)("POST", "/join", { token: "A".repeat(43) })).status).toBe(410);
    });

    it("caps live links at 20", async () => {
        const { owner, list, as } = await house();
        for (let i = 0; i < 20; i++) expect((await as(owner)("POST", `/${list.id}/invites`)).status).toBe(201);
        const over = await as(owner)("POST", `/${list.id}/invites`);
        expect(over.status).toBe(413);
        expect(over.body.error.code).toBe("SHARE_LIMIT");
    });
});

describe("joining", () => {
    it("previews the list and its owner before anything is joined", async () => {
        const { list, as, link } = await house();
        const stranger = await createUser();
        const { body } = await as(stranger)("GET", `/invite-preview?token=${tokenOf(await link())}`);
        expect(body.data).toMatchObject({
            listId: list.id,
            name: "Our House",
            emoji: "🏠",
            ownerName: "Ada",
            ownerImage: "data:image/png;base64,AAAA",
        });
        expect((await as(stranger)("GET", `/${list.id}/people`)).status).toBe(404);
    });

    it("makes the person a viewer, and joining again changes nothing", async () => {
        const { owner, list, as, link } = await house();
        const me = await createUser();
        const url = await link();
        const joined = await as(me)("POST", "/join", { token: tokenOf(url) });
        expect(joined.body.data).toEqual({ listId: list.id });
        await as(me)("POST", "/join", { token: tokenOf(url) });
        const projects = apiAs(me, "/projects", projectRoutes);
        expect((await projects("GET", "")).body.data).toMatchObject([
            { id: list.id, access: "view", members: [{ userId: me, role: "view", invitedBy: owner }] },
        ]);
        await as(owner)("PATCH", `/${list.id}/members/${me}`, { role: "edit" });
        await as(me)("POST", "/join", { token: tokenOf(url) });
        expect((await projects("GET", "")).body.data[0].access).toBe("edit"); // a re-join never demotes
    });

    it("makes the person an editor when the link was made for editing", async () => {
        const { owner, list, as } = await house();
        const me = await createUser();
        const { body } = await as(owner)("POST", `/${list.id}/invites`, { role: "edit" });
        await as(me)("POST", "/join", { token: tokenOf(body.data.url) });
        const mine = (await apiAs(me, "/projects", projectRoutes)("GET", "")).body.data;
        expect(mine).toMatchObject([{ id: list.id, access: "edit" }]);
        expect((await as(owner)("POST", `/${list.id}/invites`, { role: "owner" })).status).toBe(400);
    });

    it("lets the owner open their own link without becoming a member of it", async () => {
        const { owner, list, join } = await house();
        expect((await join(owner)).body.data).toEqual({ listId: list.id });
        expect(
            await asOwner(async (pg) => (await pg.query("SELECT 1 FROM list_members")).rows.length),
        ).toBeGreaterThanOrEqual(0);
        expect(
            await asOwner(
                async (pg) => (await pg.query("SELECT 1 FROM list_members WHERE user_id = $1", [owner])).rows,
            ),
        ).toEqual([]);
    });

    it("holds 20 people (the owner included) and 100 lists per account", async () => {
        const { list, join } = await house();
        await asOwner(async (pg) => {
            for (let i = 0; i < 18; i++) {
                const id = crypto.randomUUID();
                await pg.query("INSERT INTO users (id) VALUES ($1)", [id]);
                await pg.query("INSERT INTO list_members (list_id, user_id) VALUES ($1, $2)", [list.id, id]);
            }
        });
        expect((await join(await createUser())).status).toBe(200); // the 20th person
        const over = await join(await createUser());
        expect(over.status).toBe(413);
        expect(over.body.error.code).toBe("SHARE_LIMIT");

        const { join: joinAnother } = await house();
        const busy = await createUser();
        await asOwner(async (pg) => {
            for (let i = 0; i < 100; i++) {
                const owner = crypto.randomUUID();
                const id = crypto.randomUUID();
                await pg.query("INSERT INTO users (id) VALUES ($1)", [owner]);
                await pg.query("INSERT INTO projects (id, user_id, name) VALUES ($1, $2, 'x')", [id, owner]);
                await pg.query("INSERT INTO list_members (list_id, user_id) VALUES ($1, $2)", [id, busy]);
            }
        });
        expect((await joinAnother(busy)).status).toBe(413);
    });
});

describe("people and roles", () => {
    it("shows the people in a list to the people in it, never an email", async () => {
        const { owner, list, as, join } = await house();
        const ben = await createUser({ name: "Ben" });
        await join(ben);
        await asOwner((pg) =>
            pg.query(
                `UPDATE users SET settings = jsonb_set(settings, '{profile}', '{"pronouns":"he/him"}') WHERE id = $1`,
                [ben],
            ),
        );
        for (const viewer of [owner, ben]) {
            const { body } = await as(viewer)("GET", `/${list.id}/people`);
            expect(body.data).toEqual([
                { userId: owner, name: "Ada", image: "data:image/png;base64,AAAA", pronouns: null, role: "owner" },
                { userId: ben, name: "Ben", image: null, pronouns: "he/him", role: "view" },
            ]);
            expect(JSON.stringify(body)).not.toContain("@example.test");
        }
        expect((await as(await createUser())("GET", `/${list.id}/people`)).status).toBe(404);
    });

    it("lets the owner change a role, and no one else", async () => {
        const { owner, list, as, join } = await house();
        const ben = await createUser();
        const cy = await createUser();
        await join(ben);
        await join(cy);
        expect((await as(ben)("PATCH", `/${list.id}/members/${cy}`, { role: "edit" })).status).toBe(403);
        const set = await as(owner)("PATCH", `/${list.id}/members/${ben}`, { role: "edit" });
        expect(set.body.data).toMatchObject({ userId: ben, role: "edit" });
        expect((await as(owner)("PATCH", `/${list.id}/members/${await createUser()}`, { role: "edit" })).status).toBe(
            404,
        );
        expect((await as(owner)("PATCH", `/${list.id}/members/${ben}`, { role: "owner" })).status).toBe(400);
    });

    it("lets the owner remove anyone, and a member leave", async () => {
        const { owner, list, as, join } = await house();
        const ben = await createUser();
        const cy = await createUser();
        await join(ben);
        await join(cy);
        expect((await as(ben)("DELETE", `/${list.id}/members/${cy}`)).status).toBe(403);
        expect((await as(owner)("DELETE", `/${list.id}/members/${ben}`)).status).toBe(200);
        expect((await as(ben)("GET", `/${list.id}/people`)).status).toBe(404);
        expect((await as(cy)("DELETE", `/${list.id}/members/${cy}`)).status).toBe(200); // Leave
        expect((await as(cy)("GET", `/${list.id}/people`)).status).toBe(404);
        expect((await as(owner)("DELETE", `/${list.id}/members/${owner}`)).status).toBe(403); // the owner stops sharing instead
    });

    it("stops sharing: everyone out, every link dead, the list still the owner's", async () => {
        const { owner, list, as, link, join } = await house();
        const ben = await createUser();
        const url = await link();
        await join(ben, url);
        expect((await as(ben)("DELETE", `/${list.id}/members`)).status).toBe(403);
        expect((await as(owner)("DELETE", `/${list.id}/members`)).status).toBe(200);
        expect((await as(ben)("GET", `/${list.id}/people`)).status).toBe(404);
        expect((await join(await createUser(), url)).status).toBe(410);
        expect((await apiAs(owner, "/projects", projectRoutes)("GET", "")).body.data).toMatchObject([
            { id: list.id, members: [] },
        ]);
    });
});

describe("transferring ownership", () => {
    it("re-owns every row, swaps roles, moves reminders both ways, drops learning, clears invites, and guards permissions", async () => {
        const { owner, list, as, link, join } = await house();
        const ben = await createUser({ name: "Ben" });
        const outsider = await createUser({ name: "Outsider" });
        const url = await link();
        await join(ben, url);

        const ownerTasks = apiAs(owner, "/tasks", taskRoutes);
        const benTasks = apiAs(ben, "/tasks", taskRoutes);
        const ownerSections = apiAs(owner, "/sections", sectionRoutes);
        const ownerSteps = apiAs(owner, "", subtaskRoutes);
        const ownerNotes = apiAs(owner, "", noteRoutes);

        const section = (await ownerSections("POST", "", { name: "Kitchen", orderIndex: 1, projectId: list.id })).body
            .data;
        const ownerRem = "2030-02-01T08:00:00.000Z";
        const benRem = "2030-02-01T09:00:00.000Z";
        const task = (
            await ownerTasks("POST", "", {
                title: "Fix sink",
                orderIndex: 1,
                projectId: list.id,
                sectionId: section.id,
                reminderAt: ownerRem,
            })
        ).body.data;
        await ownerSteps("POST", `/tasks/${task.id}/subtasks`, { title: "Wrench", orderIndex: 1 });
        await ownerNotes("PATCH", `/tasks/${task.id}/note`, { body: "Check gasket", expectedVersion: 0 });
        await benTasks("PATCH", `/${task.id}`, { reminderAt: benRem });

        // Seed learning rows for the old owner.
        await asOwner(async (pg) => {
            await pg.query("INSERT INTO task_metrics (task_id, user_id) VALUES ($1, $2)", [task.id, owner]);
            await pg.query(
                "INSERT INTO task_nlp_metadata (task_id, user_id, raw_input, cleaned_title) VALUES ($1, $2, 'Fix sink', 'Fix sink')",
                [task.id, owner],
            );
            await pg.query("INSERT INTO ai_memory_notes (user_id, task_id, line_hashes) VALUES ($1, $2, ARRAY['h1'])", [
                owner,
                task.id,
            ]);
        });

        // Non-owner -> 403; non-member -> 404.
        expect((await as(ben)("POST", `/${list.id}/transfer`, { userId: owner })).status).toBe(403);
        expect((await as(owner)("POST", `/${list.id}/transfer`, { userId: outsider })).status).toBe(404);

        // Transfer to Ben.
        const res = await as(owner)("POST", `/${list.id}/transfer`, { userId: ben });
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ listId: list.id });

        // Every row is now Ben's, old owner is an editor, reminders moved both ways.
        expect((await benTasks("GET", `/${task.id}`)).body.data).toMatchObject({
            userId: ben,
            reminderAt: benRem,
        });
        expect((await ownerTasks("GET", `/${task.id}`)).body.data).toMatchObject({
            userId: ben,
            reminderAt: ownerRem,
        });

        const people = (await as(ben)("GET", `/${list.id}/people`)).body.data;
        expect(people).toEqual([
            expect.objectContaining({ userId: ben, role: "owner" }),
            expect.objectContaining({ userId: owner, role: "edit" }),
        ]);

        // Learning rows are gone and invites are cleared.
        const counts = await asOwner(async (pg) => ({
            metrics: (await pg.query("SELECT 1 FROM task_metrics WHERE task_id = $1", [task.id])).rows.length,
            nlp: (await pg.query("SELECT 1 FROM task_nlp_metadata WHERE task_id = $1", [task.id])).rows.length,
            memNotes: (await pg.query("SELECT 1 FROM ai_memory_notes WHERE task_id = $1", [task.id])).rows.length,
            invites: (await pg.query("SELECT 1 FROM share_invites WHERE list_id = $1", [list.id])).rows.length,
            subtasksOwner: (await pg.query<any>("SELECT user_id FROM subtasks WHERE task_id = $1", [task.id])).rows[0]
                .user_id,
            notesOwner: (await pg.query<any>("SELECT user_id FROM task_notes WHERE task_id = $1", [task.id])).rows[0]
                .user_id,
        }));
        expect(counts).toEqual({
            metrics: 0,
            nlp: 0,
            memNotes: 0,
            invites: 0,
            subtasksOwner: ben,
            notesOwner: ben,
        });
    });
});

describe("shared note search", () => {
    it("returns shared note terms to members and hides them from non-members", async () => {
        const { owner, list, join } = await house();
        const ben = await createUser();
        const outsider = await createUser();
        await join(ben);

        const task = (
            await apiAs(owner, "/tasks", taskRoutes)("POST", "", {
                title: "Paint",
                orderIndex: 1,
                projectId: list.id,
            })
        ).body.data;
        await apiAs(owner, "", noteRoutes)("PATCH", `/tasks/${task.id}/note`, {
            body: "Buy cerulean primer",
            expectedVersion: 0,
        });

        const benNotes = (await apiAs(ben, "/search", searchRoutes)("GET", "/task-notes")).body.data;
        expect(benNotes).toEqual([
            expect.objectContaining({ taskId: task.id, terms: expect.arrayContaining(["cerulean"]) }),
        ]);
        const outsiderNotes = (await apiAs(outsider, "/search", searchRoutes)("GET", "/task-notes")).body.data;
        expect(outsiderNotes).toEqual([]);
    });
});
