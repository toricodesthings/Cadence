import { useState, useCallback, useMemo, useEffect } from "react";
import { FOCUS_VIEW_PRESETS, composeFocusView } from "@cadence/nlp/focus-views";
import { useFocusViewStore } from "../../stores/focus-view-store";
import { useCreateFocusView, useDeleteFocusView, useFocusViews, useUpdateFocusView } from "../../hooks/core/use-focus-views";
import { useSettings } from "../../hooks/core/use-settings";
import { useProjects } from "../../hooks/projects";
import { Zap, Clock, CalendarX2, UserCheck, Brain, CloudFog, Search, X, BookmarkPlus, Pin, Trash2, Pencil } from "lucide-react";

const PRESET_ICONS: Record<string, React.ReactNode> = {
    Zap: <Zap size={13} />,
    Clock: <Clock size={13} />,
    CalendarX: <CalendarX2 size={13} />,
    UserCheck: <UserCheck size={13} />,
    Brain: <Brain size={13} />,
    CloudFog: <CloudFog size={13} />,
};

/**
 * Focus View Bar — preset pills + NL composer.
 * Placed near page headers (per Section 12.4).
 * Only renders when intelligence + focusViews are enabled.
 */
export function FocusViewBar() {
    const { data: userSettings } = useSettings();
    useFocusViews();
    const { data: projects = [] } = useProjects();
    const focusViewsEnabled = userSettings?.tasks?.intelligence?.focusViewsEnabled !== false;
    const intelligenceEnabled = userSettings?.tasks?.intelligence?.nlpEnabled !== false;
    const createFocusView = useCreateFocusView();
    const updateFocusView = useUpdateFocusView();
    const deleteFocusViewMutation = useDeleteFocusView();

    const {
        activePresetId,
        activeSavedViewId,
        activeDefinition,
        composerInput,
        savedViews,
        setPreset,
        setCustomDefinition,
        setComposerInput,
        applySavedView,
        clearActiveDefinition,
        clear,
    } = useFocusViewStore();

    const [showComposer, setShowComposer] = useState(false);

    useEffect(() => {
        if ((!intelligenceEnabled || !focusViewsEnabled) && activeDefinition) {
            clearActiveDefinition();
        }
    }, [activeDefinition, clearActiveDefinition, focusViewsEnabled, intelligenceEnabled]);

    const handleComposerSubmit = useCallback(() => {
        if (!composerInput.trim()) return;
        const result = composeFocusView(composerInput, {
            projects: projects.map((p) => ({ id: p.id, name: p.name })),
        });
        if (result.matchedPreset) {
            setPreset(result.matchedPreset);
        } else {
            setCustomDefinition(result.definition);
        }
        setShowComposer(false);
    }, [composerInput, projects, setPreset, setCustomDefinition]);

    const handleSaveCurrent = useCallback(() => {
        if (!activeDefinition) return;
        createFocusView.mutate({
            name: composerInput.trim() || "Saved view",
            definition: activeDefinition,
            isPinned: true,
            source: activePresetId ? "preset" : "composed",
            orderIndex: savedViews.length > 0
                ? Math.max(...savedViews.map((view) => view.orderIndex)) + 1
                : 0,
        });
    }, [activeDefinition, activePresetId, composerInput, createFocusView, savedViews]);

    const composerChips = useMemo(() => {
        if (!composerInput.trim()) return [];
        const result = composeFocusView(composerInput, {
            projects: projects.map((p) => ({ id: p.id, name: p.name })),
        });
        return result.matchedRules;
    }, [composerInput, projects]);

    const pinnedViews = useMemo(
        () => savedViews
            .filter((view) => view.isPinned)
            .sort((a, b) => a.orderIndex - b.orderIndex),
        [savedViews],
    );

    if (!intelligenceEnabled || !focusViewsEnabled) return null;

    return (
        <div className="flex flex-col gap-2" role="toolbar" aria-label="Focus Views">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                {/* All / clear button */}
                <button
                    type="button"
                    onClick={clear}
                    className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                        !activeDefinition
                            ? "bg-lantern/15 text-lantern border border-lantern/25"
                            : "bg-white/[0.03] text-twilight-text-muted border border-twilight-border/30 hover:bg-white/[0.06]"
                    }`}
                >
                    All
                </button>

                {/* Preset pills */}
                {FOCUS_VIEW_PRESETS.map((preset) => (
                    <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                            activePresetId === preset.id ? clear() : setPreset(preset)
                        }
                        title={preset.description}
                        className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                            activePresetId === preset.id
                                ? "bg-lantern/15 text-lantern border border-lantern/25"
                                : "bg-white/[0.03] text-twilight-text-muted border border-twilight-border/30 hover:bg-white/[0.06]"
                        }`}
                    >
                        {PRESET_ICONS[preset.icon] ?? null}
                        {preset.name}
                    </button>
                ))}

                {pinnedViews.map((view) => (
                    <button
                        key={view.id}
                        type="button"
                        onClick={() => applySavedView(view.id)}
                        title={view.source === "preset" ? "Saved preset view" : "Saved custom view"}
                        className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                            activeSavedViewId === view.id
                                ? "bg-lantern/15 text-lantern border border-lantern/25"
                                : "bg-white/[0.03] text-twilight-text-muted border border-twilight-border/30 hover:bg-white/[0.06]"
                        }`}
                    >
                        <Pin size={12} />
                        {view.name}
                    </button>
                ))}

                {/* NL composer toggle */}
                <button
                    type="button"
                    onClick={() => setShowComposer(!showComposer)}
                    title="Describe a custom focus view"
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-twilight-text-muted border border-twilight-border/30 bg-white/[0.03] hover:bg-white/[0.06] transition-colors cursor-pointer"
                    >
                        <Search size={12} />
                        <span className="hidden sm:inline">Custom</span>
                    </button>

                {activeDefinition ? (
                    <button
                        type="button"
                        onClick={handleSaveCurrent}
                        title="Save the current Focus View"
                        className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-twilight-text-muted border border-twilight-border/30 bg-white/[0.03] hover:bg-white/[0.06] transition-colors cursor-pointer"
                    >
                        <BookmarkPlus size={12} />
                        <span className="hidden sm:inline">Save</span>
                    </button>
                ) : null}
            </div>

            {/* NL Composer input */}
            {showComposer && (
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            value={composerInput}
                            onChange={(e) => setComposerInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleComposerSubmit();
                                if (e.key === "Escape") {
                                    setShowComposer(false);
                                    setComposerInput("");
                                }
                            }}
                            placeholder="e.g. overdue tasks with no project"
                            className="w-full rounded-lg border border-twilight-border/40 bg-white/[0.03] px-3 py-2 text-[12px] text-twilight-text placeholder:text-twilight-text-muted/50 outline-none focus:border-lantern/30 focus:ring-1 focus:ring-lantern/20 transition-colors"
                            autoFocus
                            aria-label="Describe a Focus View"
                        />
                        {composerInput && (
                            <button
                                type="button"
                                onClick={() => setComposerInput("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-twilight-text-muted hover:text-twilight-text cursor-pointer"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={handleComposerSubmit}
                        disabled={!composerInput.trim()}
                        className="shrink-0 rounded-lg bg-lantern/15 px-3 py-2 text-[12px] font-medium text-lantern hover:bg-lantern/25 transition-colors disabled:opacity-40 cursor-pointer"
                    >
                        Apply
                    </button>
                </div>
            )}

            {/* Composer chips preview */}
            {showComposer && composerChips.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {composerChips.map((chip) => (
                        <span
                            key={chip}
                            className="inline-flex items-center rounded-md bg-lantern/10 border border-lantern/18 px-2 py-0.5 text-[10px] font-medium text-lantern"
                        >
                            {chip}
                        </span>
                    ))}
                </div>
            )}

            {pinnedViews.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {pinnedViews.map((view) => (
                        <div
                            key={`manage-${view.id}`}
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] ${
                                activeSavedViewId === view.id
                                    ? "border-lantern/25 bg-lantern/10 text-lantern"
                                    : "border-twilight-border/30 bg-white/[0.02] text-twilight-text-muted"
                            }`}
                        >
                            <button
                                type="button"
                                onClick={() => applySavedView(view.id)}
                                className="cursor-pointer hover:text-twilight-text transition-colors"
                            >
                                {view.name}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const nextName = window.prompt("Rename Focus View", view.name);
                                    if (nextName !== null && nextName.trim()) {
                                        updateFocusView.mutate({ id: view.id, name: nextName.trim() });
                                    }
                                }}
                                className="cursor-pointer hover:text-lantern transition-colors"
                                aria-label={`Rename ${view.name}`}
                            >
                                <Pencil size={11} />
                            </button>
                            <button
                                type="button"
                                onClick={() => updateFocusView.mutate({ id: view.id, isPinned: false })}
                                className="cursor-pointer hover:text-lantern transition-colors"
                                aria-label={`Unpin ${view.name}`}
                            >
                                <Pin size={11} />
                            </button>
                            <button
                                type="button"
                                onClick={() => deleteFocusViewMutation.mutate(view.id)}
                                className="cursor-pointer hover:text-red-400 transition-colors"
                                aria-label={`Remove ${view.name}`}
                            >
                                <Trash2 size={11} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
