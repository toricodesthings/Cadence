import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FocusViewDefinition, FocusViewPreset } from "@cadence/nlp/focus-views";
import type { FocusViewSource, SavedFocusView as SavedFocusViewEntity } from "@cadence/contracts/settings";

/** A saved view as the store holds it, hydrated from `saved_focus_views`. */
export type SavedFocusView = Pick<SavedFocusViewEntity, "id" | "name" | "isPinned" | "orderIndex"> &
    Partial<Pick<SavedFocusViewEntity, "presetKey" | "icon" | "color">> & {
        definition: FocusViewDefinition;
        source: FocusViewSource;
    };

export type CaptureOrder = "newest" | "oldest" | "priority";

interface FocusViewState {
    captureOrder: CaptureOrder;
    setCaptureOrder: (order: CaptureOrder) => void;
    activePresetId: string | null;
    activeSavedViewId: string | null;
    customDefinition: FocusViewDefinition | null;
    activeDefinition: FocusViewDefinition | null;
    composerInput: string;
    savedViews: SavedFocusView[];

    hydrateSavedViews: (views: SavedFocusView[]) => void;
    setPreset: (preset: FocusViewPreset | null) => void;
    setCustomDefinition: (definition: FocusViewDefinition | null) => void;
    setComposerInput: (input: string) => void;
    applySavedView: (id: string) => void;
    clearActiveDefinition: () => void;
    clear: () => void;
}

function cloneDefinition(definition: FocusViewDefinition): FocusViewDefinition {
    return {
        ...definition,
        states: [...(definition.states ?? [])],
        projectIds: [...(definition.projectIds ?? [])],
        tagIds: [...(definition.tagIds ?? [])],
    };
}

export const useFocusViewStore = create<FocusViewState>()(
    persist(
        (set) => ({
            captureOrder: "newest",
            setCaptureOrder: (captureOrder) => set({ captureOrder }),
            activePresetId: null,
            activeSavedViewId: null,
            customDefinition: null,
            activeDefinition: null,
            composerInput: "",
            savedViews: [],

            hydrateSavedViews: (views) =>
                set((state) => {
                    const hydratedViews = views.map((view) => ({
                        ...view,
                        definition: cloneDefinition(view.definition),
                    }));
                    const activeSavedView = state.activeSavedViewId
                        ? (hydratedViews.find((view) => view.id === state.activeSavedViewId) ?? null)
                        : null;
                    const activePresetView = state.activePresetId
                        ? (hydratedViews.find((view) => view.presetKey === state.activePresetId) ?? null)
                        : null;

                    return {
                        savedViews: hydratedViews,
                        activeSavedViewId: activeSavedView?.id ?? null,
                        activeDefinition: activeSavedView
                            ? cloneDefinition(activeSavedView.definition)
                            : activePresetView
                              ? cloneDefinition(activePresetView.definition)
                              : state.activePresetId
                                ? state.activeDefinition
                                : state.activeSavedViewId
                                  ? null
                                  : state.activeDefinition,
                        customDefinition:
                            activeSavedView && activeSavedView.source !== "preset"
                                ? cloneDefinition(activeSavedView.definition)
                                : state.customDefinition,
                    };
                }),

            setPreset: (preset) =>
                set({
                    activePresetId: preset?.id ?? null,
                    activeSavedViewId: null,
                    activeDefinition: preset?.definition ? cloneDefinition(preset.definition) : null,
                    customDefinition: null,
                    composerInput: "",
                }),

            setCustomDefinition: (definition) =>
                set({
                    activePresetId: null,
                    activeSavedViewId: null,
                    customDefinition: definition ? cloneDefinition(definition) : null,
                    activeDefinition: definition ? cloneDefinition(definition) : null,
                }),

            setComposerInput: (input) => set({ composerInput: input }),

            applySavedView: (id) =>
                set((state) => {
                    const savedView = state.savedViews.find((view) => view.id === id);
                    if (!savedView) return {};
                    const definition = cloneDefinition(savedView.definition);
                    return {
                        activePresetId: null,
                        activeSavedViewId: savedView.id,
                        customDefinition: savedView.source === "preset" ? null : cloneDefinition(savedView.definition),
                        activeDefinition: definition,
                        composerInput: savedView.name,
                    };
                }),

            clearActiveDefinition: () =>
                set({
                    activePresetId: null,
                    activeSavedViewId: null,
                    customDefinition: null,
                    activeDefinition: null,
                }),

            clear: () =>
                set({
                    activePresetId: null,
                    activeSavedViewId: null,
                    customDefinition: null,
                    activeDefinition: null,
                    composerInput: "",
                }),
        }),
        {
            name: "cadence-focus-view-state",
            partialize: (state) => ({
                captureOrder: state.captureOrder,
                activePresetId: state.activePresetId,
                activeSavedViewId: state.activeSavedViewId,
                customDefinition: state.customDefinition,
                activeDefinition: state.activeDefinition,
                composerInput: state.composerInput,
                savedViews: state.savedViews,
            }),
        },
    ),
);
