export type DoersOf = (listId: string) => readonly string[] | undefined;

export function loadShare(
    task: { projectId?: string | null; takenBy?: string | null },
    me: string | null | undefined,
    doersOf: DoersOf,
): number {
    const doers = task.projectId ? doersOf(task.projectId) : undefined;
    if (!doers) return 1;
    if (task.takenBy) return task.takenBy === me ? 1 : 0;
    return me && doers.includes(me) ? 1 / doers.length : 0;
}
