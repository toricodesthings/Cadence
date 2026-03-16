import { isValidElement, type CSSProperties, type ReactNode } from "react";
import { toast as sonnerToast, type ExternalToast } from "sonner";

export const CADENCE_TOAST_DURATION = 4200;

const CADENCE_TOAST_PATCHED = Symbol.for("cadence.frontend.toast-patched");

type CadenceCSSProperties = CSSProperties & {
    "--cadence-toast-duration"?: string;
    "--cadence-toast-progress-opacity"?: string;
};

type PromiseOptions = NonNullable<Parameters<typeof sonnerToast.promise>[1]>;
type PatchableToast = typeof sonnerToast & {
    [CADENCE_TOAST_PATCHED]?: boolean;
};

type PromiseResultToast = ExternalToast & {
    message: ReactNode;
};

function cadenceProgressStyle(duration = CADENCE_TOAST_DURATION): CadenceCSSProperties {
    if (!Number.isFinite(duration) || duration <= 0) {
        return {
            "--cadence-toast-progress-opacity": "0",
        };
    }

    return {
        "--cadence-toast-duration": `${duration}ms`,
        "--cadence-toast-progress-opacity": "1",
    };
}

function withCadenceToastOptions(
    options?: ExternalToast,
    fallbackDuration = CADENCE_TOAST_DURATION,
): ExternalToast {
    const duration = options?.duration ?? fallbackDuration;
    const shouldShowCloseButton = options?.closeButton ?? Boolean(options?.description);

    return {
        ...options,
        duration,
        closeButton: shouldShowCloseButton,
        style: {
            ...cadenceProgressStyle(duration),
            ...options?.style,
        } satisfies CadenceCSSProperties,
    };
}

function normalizePromiseResult(
    result: unknown,
    fallbackDuration = CADENCE_TOAST_DURATION,
): unknown {
    if (result == null) {
        return result;
    }

    if (typeof result === "string" || isValidElement(result)) {
        return {
            ...withCadenceToastOptions(undefined, fallbackDuration),
            message: result,
        } satisfies PromiseResultToast;
    }

    if (typeof result === "object") {
        return withCadenceToastOptions(result as ExternalToast, fallbackDuration);
    }

    return result;
}

function wrapPromiseState<T>(state: T, fallbackDuration = CADENCE_TOAST_DURATION): T {
    if (typeof state !== "function") {
        return normalizePromiseResult(state, fallbackDuration) as T;
    }

    return (async (value: unknown) =>
        normalizePromiseResult(
            await (state as (input: unknown) => unknown)(value),
            fallbackDuration,
        )) as T;
}

function withCadencePromiseData(data?: PromiseOptions): PromiseOptions | undefined {
    if (!data) {
        return data;
    }

    const fallbackDuration = data.duration ?? CADENCE_TOAST_DURATION;

    return {
        ...data,
        style: {
            ...cadenceProgressStyle(Number.POSITIVE_INFINITY),
            ...data.style,
        } satisfies CadenceCSSProperties,
        success: wrapPromiseState(data.success, fallbackDuration),
        error: wrapPromiseState(data.error, fallbackDuration),
    };
}

export function installCadenceToastTheme() {
    const toast = sonnerToast as PatchableToast;

    if (toast[CADENCE_TOAST_PATCHED]) {
        return;
    }

    const originalMessage = sonnerToast.message.bind(sonnerToast);
    const originalSuccess = sonnerToast.success.bind(sonnerToast);
    const originalInfo = sonnerToast.info.bind(sonnerToast);
    const originalWarning = sonnerToast.warning.bind(sonnerToast);
    const originalError = sonnerToast.error.bind(sonnerToast);
    const originalLoading = sonnerToast.loading.bind(sonnerToast);
    const originalPromise = sonnerToast.promise.bind(sonnerToast);
    const originalCustom = sonnerToast.custom.bind(sonnerToast);

    toast.message = ((message, data) =>
        originalMessage(message, withCadenceToastOptions(data))) as typeof sonnerToast.message;
    toast.success = ((message, data) =>
        originalSuccess(message, withCadenceToastOptions(data))) as typeof sonnerToast.success;
    toast.info = ((message, data) =>
        originalInfo(message, withCadenceToastOptions(data))) as typeof sonnerToast.info;
    toast.warning = ((message, data) =>
        originalWarning(message, withCadenceToastOptions(data))) as typeof sonnerToast.warning;
    toast.error = ((message, data) =>
        originalError(message, withCadenceToastOptions(data))) as typeof sonnerToast.error;
    toast.loading = ((message, data) =>
        originalLoading(message, withCadenceToastOptions(data, Number.POSITIVE_INFINITY))) as typeof sonnerToast.loading;
    toast.promise = ((promise, data) =>
        (originalPromise as typeof sonnerToast.promise)(
            promise,
            withCadencePromiseData(data as PromiseOptions | undefined) as never,
        )) as typeof sonnerToast.promise;
    toast.custom = ((jsx, data) =>
        originalCustom(jsx, withCadenceToastOptions(data))) as typeof sonnerToast.custom;

    toast[CADENCE_TOAST_PATCHED] = true;
}
