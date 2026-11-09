import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router";
import { useDeviceValue } from "./use-device-flag";

/** `replace` keeps a view change out of Back; `preventScrollReset` keeps the page where it is. */
const QUIET = { replace: true, preventScrollReset: true } as const;

/** Sets or removes one search param. A param equal to its default is removed, so plain URLs stay plain. */
export function writeParam(prev: URLSearchParams, param: string, value: string | null) {
    const next = new URLSearchParams(prev);
    if (value === null) next.delete(param);
    else next.set(param, value);
    return next;
}

/**
 * View state that lives in the address (`?sort=priority`) so a browser view can be bookmarked or shared.
 * The URL wins when its value is valid; otherwise this device's saved choice; otherwise `fallback`.
 * Choosing saves the device value too (a bare URL still opens the way the person left it), and an
 * invalid value in the URL is dropped quietly. A link someone shares never overwrites the device's choice.
 */
export function useUrlState<T>(param: string, { parse, serialize = String, fallback, deviceKey }: {
    /** The value for a stored string, or null when it isn't one of this state's values. */
    parse: (raw: string | null) => T | null;
    serialize?: (value: T) => string;
    fallback: T;
    /** Where this device remembers the choice. */
    deviceKey: string;
}): [T, (next: T) => void] {
    const [searchParams, setSearchParams] = useSearchParams();
    const [device, setDevice] = useDeviceValue(deviceKey);
    const raw = searchParams.get(param);
    const fromUrl = parse(raw);
    const value = fromUrl ?? parse(device) ?? fallback;

    useEffect(() => {
        if (raw !== null && fromUrl === null) setSearchParams((prev) => writeParam(prev, param, null), QUIET);
    }, [raw, fromUrl, param, setSearchParams]);

    const set = useCallback((next: T) => {
        const text = serialize(next);
        setDevice(text);
        setSearchParams((prev) => writeParam(prev, param, text === serialize(fallback) ? null : text), QUIET);
    }, [param, serialize, fallback, setDevice, setSearchParams]);

    return [value, set];
}
