import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FocusViewDefinition, FocusViewPreset } from "@cadence/nlp/focus-views";

export interface SavedFocusView {
    id: string;
    name: string;
    definition: FocusViewDefinition;
    isPinned: boolean;
    source: "preset" | "composed" | "manual" | "custom";
    orderIndex: number;
}

interface FocusViewState {
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
    saveCurrentView: (name?: string) => SavedFocusView | null;
    updateSavedViewName: (id: string, name: string) => void;
    pinSavedView: (id: string, isPinned?: boolean) => void;
    deleteSavedView: (id: string) => void;
    applySavedView: (id: string) => void;
    clearActiveDefinition: () => void;
    clear: () => void;
}

function cloneDefinition(definition: FocusViewDefinition): FocusViewDefinition {
    return {
        ...definition,
        states: [...definition.states],
        projectIds: [...definition.projectIds],
        tagIds: [...definition.tagIds],
    };
}

export const useFocusViewStore = create<FocusViewState>()(
    persist(
        (set, get) => ({
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
                        ? hydratedViews.find((view) => view.id === state.activeSavedViewId) ?? null
                        : null;

                    return {
                        savedViews: hydratedViews,
                        activeSavedViewId: activeSavedView?.id ?? null,
                        activeDefinition: activeSavedView
                            ? cloneDefinition(activeSavedView.definition)
                            : state.activePresetId
                                ? state.activeDefinition
                                : state.activeSavedViewId
                                    ? null
                                    : state.activeDefinition,
                        customDefinition: activeSavedView && activeSavedView.source !== "preset"
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

            saveCurrentView: (name) => {
                const state = get();
                const definition = state.activeDefinition;
                if (!definition) return null;

                const savedView: SavedFocusView = {
                    id: crypto.randomUUID(),
                    name: name?.trim() || state.composerInput.trim() || "Saved view",
                    definition: cloneDefinition(definition),
                    isPinned: true,
                    source: state.activePresetId ? "preset" : "custom",
                    orderIndex: state.savedViews.length > 0
                        ? Math.max(...state.savedViews.map((view) => view.orderIndex)) + 1
                        : 0,
                };

                set((current) => ({
                    savedViews: [...current.savedViews, savedView],
                    activeSavedViewId: savedView.id,
                    activePresetId: null,
                    customDefinition: cloneDefinition(savedView.definition),
                    activeDefinition: cloneDefinition(savedView.definition),
                    composerInput: "",
                }));

                return savedView;
            },

            updateSavedViewName: (id, name) =>
                set((state) => ({
                    savedViews: state.savedViews.map((view) =>
                        view.id === id ? { ...view, name: name.trim() || view.name } : view,
                    ),
                })),

            pinSavedView: (id, isPinned) =>
                set((state) => ({
                    savedViews: state.savedViews.map((view) =>
                        view.id === id ? { ...view, isPinned: isPinned ?? !view.isPinned } : view,
                    ),
                })),

            deleteSavedView: (id) =>
                set((state) => {
                    const next = state.savedViews.filter((view) => view.id !== id);
                    return {
                        savedViews: next,
                        activeSavedViewId: state.activeSavedViewId === id ? null : state.activeSavedViewId,
                        ...(state.activeSavedViewId === id
                            ? { activePresetId: null, customDefinition: null, activeDefinition: null }
                            : {}),
                    };
                }),

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
