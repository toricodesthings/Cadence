/** Web Lock liveness for editing branches: a tab holds its branch's lock for as long as it lives. */

export function holdBranch(branch: string): () => void {
    if (typeof navigator === "undefined" || !navigator.locks) return () => {};
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    void navigator.locks.request(`cadence-note-branch:${branch}`, () => held).catch(() => {});
    return release;
}

/** Whether a tab is still living on that branch. Without Web Locks nothing can be proven alive, so a draft is treated as abandoned. */
export async function branchAlive(branch: string): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.locks) return false;
    return navigator.locks.request(`cadence-note-branch:${branch}`, { ifAvailable: true }, (lock) => !lock);
}
