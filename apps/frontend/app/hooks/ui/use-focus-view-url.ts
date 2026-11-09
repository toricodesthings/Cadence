import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { FOCUS_VIEW_PRESETS } from "@cadence/nlp/focus-views";
import { DEFINITION_PARAMS, definitionFromParams, definitionToParams } from "@cadence/nlp/focus-views/url";
import { useFocusViewStore, type CaptureOrder } from "../../stores/focus-view-store";
import { writeParam } from "./use-url-state";

const ORDERS: readonly CaptureOrder[] = ["newest", "oldest", "priority"];

/**
 * Capture order (`?order=`), a focus preset (`?focus=`) and a saved view (`?saved=`) in the address, so a
 * browser view can be bookmarked or shared. The store stays the working copy: a URL that names one wins
 * when the bar mounts or the address changes; otherwise the store writes itself to the address.
 * A custom view (no preset or saved view behind it) is written as short readable params
 * (`?state=waiting&pmin=2&bare=1`, see `definitionToParams`), fields at default left out.
 * A name that matches nothing (another account's saved view) is ignored and dropped.
 */
export function useFocusViewUrl(capture: boolean) {
    const [params, setParams] = useSearchParams();
    const { captureOrder, setCaptureOrder, activePresetId, activeSavedViewId, savedViews, setPreset, applySavedView, customDefinition, setCustomDefinition } = useFocusViewStore();
    // The order only means something on Capture; other pages leave `order` alone.
    const urlOrder = capture ? ORDERS.find((o) => o === params.get("order")) ?? null : null;
    const preset = FOCUS_VIEW_PRESETS.find((p) => p.id === params.get("focus")) ?? null;
    const urlSaved = params.get("saved");
    // When the address names a view, it is applied first; the store only writes to the address after that.
    const urlCustom = preset || urlSaved ? null : definitionFromParams(params);
    const urlCustomKey = urlCustom ? JSON.stringify(urlCustom) : "";
    // Only a view with nothing named behind it is written as params.
    const customKey = !activePresetId && !activeSavedViewId && customDefinition ? JSON.stringify(definitionToParams(customDefinition)) : "";
    const adopting = useRef(Boolean(urlOrder || preset || urlSaved || urlCustom));

    // Address → store.
    useEffect(() => {
        if (urlOrder && urlOrder !== captureOrder) setCaptureOrder(urlOrder);
    }, [urlOrder]); // eslint-disable-line react-hooks/exhaustive-deps -- applies when the address changes, not when the store does
    useEffect(() => {
        if (preset && preset.id !== activePresetId) setPreset(preset);
    }, [preset?.id]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (urlSaved && urlSaved !== activeSavedViewId && savedViews.some((v) => v.id === urlSaved)) applySavedView(urlSaved);
    }, [urlSaved, savedViews]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (urlCustom && urlCustomKey !== (customKey && JSON.stringify(customDefinition))) setCustomDefinition(urlCustom);
    }, [urlCustomKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // Store → address.
    useEffect(() => {
        if (adopting.current) {
            adopting.current = false;
            return;
        }
        setParams((prev) => {
            let next = capture ? writeParam(prev, "order", captureOrder === "newest" ? null : captureOrder) : prev;
            next = writeParam(next, "focus", activePresetId);
            const custom = customKey ? (JSON.parse(customKey) as Record<string, string>) : {};
            for (const k of DEFINITION_PARAMS) next = writeParam(next, k, custom[k] ?? null);
            return writeParam(next, "saved", activeSavedViewId);
        }, { replace: true, preventScrollReset: true });
    }, [capture, captureOrder, activePresetId, activeSavedViewId, customKey, setParams]);
}
