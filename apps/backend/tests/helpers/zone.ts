import { asOwner, createUser } from "./db";

/** A fresh user whose `users.time_zone` is `zone` (the one zone every server path reads). */
export async function createUserIn(zone: string, settings?: Record<string, unknown>): Promise<string> {
    const id = await createUser(settings);
    await asOwner((pg) => pg.query("UPDATE users SET time_zone = $2 WHERE id = $1", [id, zone]));
    return id;
}
