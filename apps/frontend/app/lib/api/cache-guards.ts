interface TransformListCacheOptions {
    initialize?: boolean;
}

export function transformListCache<T>(
    old: T[] | undefined,
    transform: (items: T[]) => T[],
    options?: TransformListCacheOptions,
): T[] | undefined {
    if (Array.isArray(old)) {
        return transform(old);
    }

    if (old === undefined && options?.initialize) {
        return transform([]);
    }

    return old as T[] | undefined;
}
