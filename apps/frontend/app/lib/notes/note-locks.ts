export function holdBranch(branch: string): () => void {
    if (typeof navigator === "undefined" || !navigator.locks) return () => {};
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    void navigator.locks.request(`cadence-note-branch:${branch}`, () => held).catch(() => {});
    return release;
}

export async function branchAlive(branch: string): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.locks) return false;
    return navigator.locks.request(`cadence-note-branch:${branch}`, { ifAvailable: true }, (lock) => !lock);
}
