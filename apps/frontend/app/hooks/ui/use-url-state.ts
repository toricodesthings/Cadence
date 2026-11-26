import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router";
import { useDeviceValue } from "./use-device-flag";

const QUIET = { replace: true, preventScrollReset: true } as const;

export function writeParam(prev: URLSearchParams, param: string, value: string | null) {
    const next = new URLSearchParams(prev);
    if (value === null) next.delete(param);
    else next.set(param, value);
    return next;
}

export function useUrlState<T>(
    param: string,
    {
        parse,
        serialize = String,
        fallback,
        deviceKey,
    }: {
        parse: (raw: string | null) => T | null;
        serialize?: (value: T) => string;
        fallback: T;
        deviceKey: string;
    },
): [T, (next: T) => void] {
    const [searchParams, setSearchParams] = useSearchParams();
    const [device, setDevice] = useDeviceValue(deviceKey);
    const raw = searchParams.get(param);
    const fromUrl = parse(raw);
    const value = fromUrl ?? parse(device) ?? fallback;

    useEffect(() => {
        if (raw !== null && fromUrl === null) setSearchParams((prev) => writeParam(prev, param, null), QUIET);
    }, [raw, fromUrl, param, setSearchParams]);

    const set = useCallback(
        (next: T) => {
            const text = serialize(next);
            setDevice(text);
            setSearchParams((prev) => writeParam(prev, param, text === serialize(fallback) ? null : text), QUIET);
        },
        [param, serialize, fallback, setDevice, setSearchParams],
    );

    return [value, set];
}
