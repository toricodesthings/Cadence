import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { FOCUS_VIEW_PRESETS } from "@cadence/nlp/focus-views";
import { DEFINITION_PARAMS, definitionFromParams, definitionToParams } from "@cadence/nlp/focus-views/url";
import { useFocusViewStore, type CaptureOrder } from "../../stores/focus-view-store";
import { writeParam } from "./use-url-state";

const ORDERS: readonly CaptureOrder[] = ["newest", "oldest", "priority"];

export function useFocusViewUrl(capture: boolean) {
    const [params, setParams] = useSearchParams();
    const {
        captureOrder,
        setCaptureOrder,
        activePresetId,
        activeSavedViewId,
        savedViews,
        setPreset,
        applySavedView,
        customDefinition,
        setCustomDefinition,
    } = useFocusViewStore();
    const urlOrder = capture ? (ORDERS.find((o) => o === params.get("order")) ?? null) : null;
    const preset = FOCUS_VIEW_PRESETS.find((p) => p.id === params.get("focus")) ?? null;
    const urlSaved = params.get("saved");
    const urlCustom = preset || urlSaved ? null : definitionFromParams(params);
    const urlCustomKey = urlCustom ? JSON.stringify(urlCustom) : "";
    const customKey =
        !activePresetId && !activeSavedViewId && customDefinition
            ? JSON.stringify(definitionToParams(customDefinition))
            : "";
    const adopting = useRef(Boolean(urlOrder || preset || urlSaved || urlCustom));

    useEffect(() => {
        if (urlOrder && urlOrder !== captureOrder) setCaptureOrder(urlOrder);
    }, [urlOrder]); // eslint-disable-line react-hooks/exhaustive-deps -- applies when the address changes, not when the store does
    useEffect(() => {
        if (preset && preset.id !== activePresetId) setPreset(preset);
    }, [preset?.id]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (urlSaved && urlSaved !== activeSavedViewId && savedViews.some((v) => v.id === urlSaved))
            applySavedView(urlSaved);
    }, [urlSaved, savedViews]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (urlCustom && urlCustomKey !== (customKey && JSON.stringify(customDefinition)))
            setCustomDefinition(urlCustom);
    }, [urlCustomKey]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (adopting.current) {
            adopting.current = false;
            return;
        }
        setParams(
            (prev) => {
                let next = capture ? writeParam(prev, "order", captureOrder === "newest" ? null : captureOrder) : prev;
                next = writeParam(next, "focus", activePresetId);
                const custom = customKey ? (JSON.parse(customKey) as Record<string, string>) : {};
                for (const k of DEFINITION_PARAMS) next = writeParam(next, k, custom[k] ?? null);
                return writeParam(next, "saved", activeSavedViewId);
            },
            { replace: true, preventScrollReset: true },
        );
    }, [capture, captureOrder, activePresetId, activeSavedViewId, customKey, setParams]);
}
