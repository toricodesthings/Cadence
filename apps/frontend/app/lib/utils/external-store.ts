/** A module-level value for `useSyncExternalStore`: `get` is the snapshot, `set` notifies subscribers. */
export function createExternalStore<T>(initial: T) {
    let value = initial;
    const listeners = new Set<() => void>();

    return {
        get: () => value,
        set(next: T) {
            value = next;
            listeners.forEach((listener) => listener());
        },
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}
