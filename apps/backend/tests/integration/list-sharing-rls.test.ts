import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { asOwner, createUser, getTestDb, startTestDb } from "../helpers/db";
import { seedSharedList } from "../helpers/sharing";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import {
    projects,
    subtasks,
    tags,
    taskNotes,
    taskPersonal,
    taskSections,
    tasks,
    taskTags,
    users,
} from "../../src/db/schema";
import { withRls } from "../../src/platform/rls";

beforeAll(startTestDb);

const as = <T>(userId: string, fn: Parameters<typeof withRls<T>>[2]) => withRls(getTestDb(), userId, fn);

/** One task, section, subtask and note in the list, owned by the list owner. */
async function seedContent(owner: string, listId: string) {
    const taskId = crypto.randomUUID();
    const sectionId = crypto.randomUUID();
    const otherList = crypto.randomUUID();
    await asOwner(async (pg) => {
        await pg.query("INSERT INTO projects (id, user_id, name) VALUES ($1, $2, 'Private')", [otherList, owner]);
        await pg.query(
            "INSERT INTO task_sections (id, user_id, project_id, name, order_index) VALUES ($1,$2,$3,'Rooms',1)",
            [sectionId, owner, listId],
        );
        await pg.query("INSERT INTO tasks (id, user_id, project_id, title, order_index) VALUES ($1,$2,$3,'Paint',1)", [
            taskId,
            owner,
            listId,
        ]);
        await pg.query("INSERT INTO tasks (user_id, project_id, title, order_index) VALUES ($1,$2,'Secret',1)", [
            owner,
            otherList,
        ]);
        await pg.query("INSERT INTO tasks (user_id, title, order_index) VALUES ($1,'Unlisted',1)", [owner]);
        await pg.query("INSERT INTO subtasks (task_id, user_id, title, order_index) VALUES ($1,$2,'Buy tape',1)", [
            taskId,
            owner,
        ]);
        await pg.query("INSERT INTO task_notes (task_id, user_id, body) VALUES ($1,$2,'Two coats')", [taskId, owner]);
    });
    return { taskId, sectionId, otherList };
}

describe("a shared list under row-level security", () => {
    it("shows a non-member nothing", async () => {
        const { owner, outsider, listId } = await seedSharedList("view");
        await seedContent(owner, listId);
        expect(await as(outsider, (tx) => tx.select().from(projects))).toEqual([]);
        expect(await as(outsider, (tx) => tx.select().from(tasks))).toEqual([]);
        expect(await as(outsider, (tx) => tx.select().from(taskSections))).toEqual([]);
    });

    it("lets a viewer read the list's tasks, sections, steps and notes, and nothing else of the owner's", async () => {
        const { owner, member, listId } = await seedSharedList("view");
        await seedContent(owner, listId);
        expect((await as(member, (tx) => tx.select().from(projects))).map((p) => p.name)).toEqual(["Our House"]);
        expect((await as(member, (tx) => tx.select().from(tasks))).map((t) => t.title)).toEqual(["Paint"]);
        expect((await as(member, (tx) => tx.select().from(taskSections))).map((s) => s.name)).toEqual(["Rooms"]);
        expect((await as(member, (tx) => tx.select().from(subtasks))).map((s) => s.title)).toEqual(["Buy tape"]);
        expect((await as(member, (tx) => tx.select().from(taskNotes))).map((n) => n.body)).toEqual(["Two coats"]);
        // The owner's account row is theirs alone.
        expect(await as(member, (tx) => tx.select().from(users).where(eq(users.id, owner)))).toEqual([]);
    });

    it("stops a viewer from inserting or changing anything", async () => {
        const { owner, member, listId } = await seedSharedList("view");
        const { taskId } = await seedContent(owner, listId);
        await expect(
            as(member, (tx) =>
                tx.insert(tasks).values({ userId: owner, projectId: listId, title: "Nope", orderIndex: 1 }),
            ),
        ).rejects.toThrow();
        expect(
            await as(member, (tx) =>
                tx.update(tasks).set({ title: "Changed" }).where(eq(tasks.id, taskId)).returning(),
            ),
        ).toEqual([]);
        await expect(
            as(member, (tx) => tx.insert(subtasks).values({ taskId, userId: owner, title: "Nope", orderIndex: 2 })),
        ).rejects.toThrow();
        expect(
            await as(member, (tx) =>
                tx.update(taskNotes).set({ body: "x" }).where(eq(taskNotes.taskId, taskId)).returning(),
            ),
        ).toEqual([]);
    });

    it("lets an editor create and edit, stamps who did, and keeps the rows the owner's", async () => {
        const { owner, member, listId } = await seedSharedList("edit");
        const { taskId, sectionId } = await seedContent(owner, listId);

        const [made] = await as(member, (tx) =>
            tx.insert(tasks).values({ userId: owner, projectId: listId, title: "Buy milk", orderIndex: 2 }).returning(),
        );
        expect(made).toMatchObject({ userId: owner, createdBy: member, updatedBy: null });

        const [edited] = await as(member, (tx) =>
            tx.update(tasks).set({ title: "Buy oat milk" }).where(eq(tasks.id, made.id)).returning(),
        );
        expect(edited).toMatchObject({ title: "Buy oat milk", updatedBy: member, createdBy: member });

        const [section] = await as(member, (tx) =>
            tx
                .insert(taskSections)
                .values({ userId: owner, projectId: listId, name: "Kitchen", orderIndex: 2 })
                .returning(),
        );
        expect(section.createdBy).toBe(member);
        const [step] = await as(member, (tx) =>
            tx.insert(subtasks).values({ taskId, userId: owner, title: "Rinse brush", orderIndex: 2 }).returning(),
        );
        expect(step.createdBy).toBe(member);
        const [note] = await as(member, (tx) =>
            tx.update(taskNotes).set({ body: "Three coats" }).where(eq(taskNotes.taskId, taskId)).returning(),
        );
        expect(note.updatedBy).toBe(member);
        expect(sectionId).toBeTruthy();
    });

    it("never lets an editor delete a task, section or list, or re-own, or move a task out", async () => {
        const { owner, member, listId } = await seedSharedList("edit");
        const { taskId, sectionId, otherList } = await seedContent(owner, listId);
        expect(await as(member, (tx) => tx.delete(tasks).where(eq(tasks.id, taskId)).returning())).toEqual([]);
        expect(
            await as(member, (tx) => tx.delete(taskSections).where(eq(taskSections.id, sectionId)).returning()),
        ).toEqual([]);
        expect(await as(member, (tx) => tx.delete(projects).where(eq(projects.id, listId)).returning())).toEqual([]);
        // The other list is invisible, so a task can't be moved there (the CHECK fails) ...
        await expect(
            as(member, (tx) => tx.update(tasks).set({ projectId: otherList }).where(eq(tasks.id, taskId))),
        ).rejects.toThrow();
        // ... and can't be given to someone else.
        await expect(
            as(member, (tx) => tx.update(tasks).set({ userId: member }).where(eq(tasks.id, taskId))),
        ).rejects.toThrow();
        // A task for the editor's own account, in the owner's list, is refused too.
        await expect(
            as(member, (tx) =>
                tx.insert(tasks).values({ userId: member, projectId: listId, title: "Mine", orderIndex: 1 }),
            ),
        ).rejects.toThrow();
    });

    it("can delete a step as an editor (not as a viewer)", async () => {
        const edit = await seedSharedList("edit");
        await seedContent(edit.owner, edit.listId);
        expect(await as(edit.member, (tx) => tx.delete(subtasks).returning())).toHaveLength(1);
        const view = await seedSharedList("view");
        await seedContent(view.owner, view.listId);
        expect(await as(view.member, (tx) => tx.delete(subtasks).returning())).toEqual([]);
    });

    it("clears both who-columns when the member's account goes", async () => {
        const { owner, member, listId } = await seedSharedList("edit");
        const [made] = await as(member, (tx) =>
            tx.insert(tasks).values({ userId: owner, projectId: listId, title: "Buy milk", orderIndex: 1 }).returning(),
        );
        await as(member, (tx) => tx.update(tasks).set({ title: "Oat" }).where(eq(tasks.id, made.id)));
        await asOwner((pg) => pg.query("DELETE FROM users WHERE id = $1", [member]));
        const [row] = await asOwner(
            async (pg) =>
                (await pg.query<any>("SELECT created_by, updated_by FROM tasks WHERE id = $1", [made.id])).rows,
        );
        expect(row).toEqual({ created_by: null, updated_by: null });
        expect(
            await asOwner(
                async (pg) => (await pg.query("SELECT 1 FROM list_members WHERE user_id = $1", [member])).rows,
            ),
        ).toEqual([]);
    });

    it("keeps membership rows to the people involved, and only the owner changes a role", async () => {
        const { owner, member, outsider, listId } = await seedSharedList("view");
        expect(await as(outsider, (tx) => tx.execute("select * from list_members" as never))).toMatchObject({
            rows: [],
        });
        expect(
            ((await as(member, (tx) => tx.execute("select * from list_members" as never))) as any).rows,
        ).toHaveLength(1);
        const promote = (who: string) =>
            as(who, (tx) =>
                tx.execute(`update list_members set role = 'edit' where list_id = '${listId}' returning 1` as never),
            ) as Promise<any>;
        expect((await promote(member)).rows).toHaveLength(0);
        expect((await promote(owner)).rows).toHaveLength(1);
        // Nobody can add themselves: only cadence_join_list inserts.
        await expect(
            as(outsider, (tx) =>
                tx.execute(
                    `insert into list_members (list_id, user_id, role) values ('${listId}','${outsider}','edit')` as never,
                ),
            ),
        ).rejects.toThrow();
    });

    it("keeps invite links to the list's owner", async () => {
        const { owner, member, listId } = await seedSharedList("edit");
        await asOwner((pg) =>
            pg.query(
                "INSERT INTO share_invites (token_hash, list_id, created_by, expires_at) VALUES ('h', $1, $2, now() + interval '1 day')",
                [listId, owner],
            ),
        );
        expect(
            ((await as(member, (tx) => tx.execute("select * from share_invites" as never))) as any).rows,
        ).toHaveLength(0);
        expect(
            ((await as(owner, (tx) => tx.execute("select * from share_invites" as never))) as any).rows,
        ).toHaveLength(1);
        expect(await createUser()).toBeTruthy();
    });

    it("isolates task_personal per member and blocks non-members", async () => {
        const { owner, member, outsider, listId } = await seedSharedList("view");
        const { taskId } = await seedContent(owner, listId);
        const reminderAt = "2026-12-01T10:00:00.000Z";

        await as(member, (tx) => tx.insert(taskPersonal).values({ taskId, userId: member, reminderAt }));
        expect(await as(member, (tx) => tx.select().from(taskPersonal))).toHaveLength(1);
        expect(await as(owner, (tx) => tx.select().from(taskPersonal))).toEqual([]);
        expect(await as(outsider, (tx) => tx.select().from(taskPersonal))).toEqual([]);

        await expect(
            as(outsider, (tx) => tx.insert(taskPersonal).values({ taskId, userId: outsider, reminderAt })),
        ).rejects.toThrow();
    });

    it("isolates task_tags per person on shared tasks", async () => {
        const { owner, member, listId } = await seedSharedList("view");
        const { taskId } = await seedContent(owner, listId);
        const [ownerTag] = await as(owner, (tx) =>
            tx.insert(tags).values({ userId: owner, name: "OwnerTag" }).returning(),
        );
        const [memberTag] = await as(member, (tx) =>
            tx.insert(tags).values({ userId: member, name: "MemberTag" }).returning(),
        );

        await as(owner, (tx) => tx.insert(taskTags).values({ taskId, tagId: ownerTag.id }));
        await as(member, (tx) => tx.insert(taskTags).values({ taskId, tagId: memberTag.id }));

        expect((await as(owner, (tx) => tx.select().from(taskTags))).map((r) => r.tagId)).toEqual([ownerTag.id]);
        expect((await as(member, (tx) => tx.select().from(taskTags))).map((r) => r.tagId)).toEqual([memberTag.id]);
    });
});
