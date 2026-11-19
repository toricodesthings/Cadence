import { asOwner, createUser } from "./db";

/** An owner, their list, and a person in it at `role` (or nobody, with `role: null`), seeded past the API. */
export async function seedSharedList(role: "view" | "edit" | null = "view") {
    const owner = await createUser({ name: "Owner" });
    const member = await createUser({ name: "Member" });
    const outsider = await createUser({ name: "Outsider" });
    const listId = crypto.randomUUID();
    await asOwner(async (pg) => {
        await pg.query("INSERT INTO projects (id, user_id, name) VALUES ($1, $2, 'Our House')", [listId, owner]);
        if (role)
            await pg.query("INSERT INTO list_members (list_id, user_id, role) VALUES ($1, $2, $3)", [
                listId,
                member,
                role,
            ]);
    });
    return { owner, member, outsider, listId };
}

/** Reads the token out of a minted link. */
export const tokenOf = (url: string) => url.slice(url.lastIndexOf("/") + 1);
