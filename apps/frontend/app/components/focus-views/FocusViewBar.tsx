import { useState, useCallback, useMemo, useEffect } from "react";
import { FOCUS_VIEW_PRESETS, composeFocusView } from "@cadence/nlp/focus-views";
import { useFocusViewStore } from "../../stores/focus-view-store";
import { useCreateFocusView, useDeleteFocusView, useFocusViews, useUpdateFocusView } from "../../hooks/core/use-focus-views";
import { useSettings } from "../../hooks/core/use-settings";
import { useProjects } from "../../hooks/projects";
import { Zap, Clock, CalendarX2, UserCheck, Brain, CloudFog, Search, X, BookmarkPlus, Pin, Trash2, Pencil, ChevronDown, ChevronRight } from "lucide-react";
import * as ContextMenu from "../primitives/ContextMenu";

const PRESET_ICONS: Record<string, React.ReactNode> = {
    Zap: <Zap size={14} />,
    Clock: <Clock size={14} />,
    CalendarX: <CalendarX2 size={14} />,
    UserCheck: <UserCheck size={14} />,
    Brain: <Brain size={14} />,
    CloudFog: <CloudFog size={14} />,
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
    const [collapsed, setCollapsed] = useState(true);

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

    if (collapsed) {
        return (
            <div className="flex items-center gap-2" role="toolbar" aria-label="Focus Views">
                <button
                    type="button"
                    onClick={() => setCollapsed(false)}
                    className={`shrink-0 inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors cursor-pointer ${
                        activeDefinition
                            ? "bg-lantern/15 text-lantern border border-lantern/25"
                            : "bg-white/[0.03] text-twilight-text-muted border border-twilight-border/30 hover:bg-white/[0.06]"
                    }`}
                >
                    <Zap size={14} aria-hidden="true" />
                    Focus{activeDefinition ? ` · ${activePresetId ?? "Custom"}` : ""}
                    <ChevronRight size={14} aria-hidden="true" />
                </button>
                {activeDefinition && (
                    <button
                        type="button"
                        onClick={clear}
                        className="shrink-0 rounded-xl px-2.5 py-2 text-[13px] font-medium text-twilight-text-muted border border-twilight-border/30 bg-white/[0.03] hover:bg-white/[0.06] transition-colors cursor-pointer"
                        title="Clear focus view"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2" role="toolbar" aria-label="Focus Views">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
                {/* Collapse trigger */}
                <button
                    type="button"
                    onClick={() => setCollapsed(true)}
                    title="Collapse Focus Views"
                    className="shrink-0 inline-flex items-center justify-center rounded-xl p-2 text-twilight-text-muted border border-twilight-border/30 bg-white/[0.03] hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                    <ChevronDown size={14} aria-hidden="true" />
                </button>
                {/* All / clear button */}
                <button
                    type="button"
                    onClick={clear}
                    className={`shrink-0 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors cursor-pointer ${
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
                        className={`shrink-0 inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors cursor-pointer ${
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
                    <ContextMenu.Root key={view.id}>
                        <ContextMenu.Trigger asChild>
                            <button
                                type="button"
                                onClick={() => applySavedView(view.id)}
                                title={view.source === "preset" ? "Saved preset view" : "Saved custom view"}
                                className={`shrink-0 inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors cursor-pointer ${
                                    activeSavedViewId === view.id
                                        ? "bg-lantern/15 text-lantern border border-lantern/25"
                                        : "bg-white/[0.03] text-twilight-text-muted border border-twilight-border/30 hover:bg-white/[0.06]"
                                }`}
                            >
                                <Pin size={14} />
                                {view.name}
                            </button>
                        </ContextMenu.Trigger>
                        <ContextMenu.Content>
                            <ContextMenu.Item
                                onSelect={() => {
                                    const nextName = window.prompt("Rename Focus View", view.name);
                                    if (nextName !== null && nextName.trim()) {
                                        updateFocusView.mutate({ id: view.id, name: nextName.trim() });
                                    }
                                }}
                            >
                                <Pencil size={14} className="mr-2 opacity-60" />
                                Rename
                            </ContextMenu.Item>
                            <ContextMenu.Item
                                onSelect={() => updateFocusView.mutate({ id: view.id, isPinned: false })}
                            >
                                <Pin size={14} className="mr-2 opacity-60" />
                                Unpin
                            </ContextMenu.Item>
                            <ContextMenu.Separator />
                            <ContextMenu.Item
                                variant="danger"
                                onSelect={() => deleteFocusViewMutation.mutate(view.id)}
                            >
                                <Trash2 size={14} className="mr-2" />
                                Delete
                            </ContextMenu.Item>
                        </ContextMenu.Content>
                    </ContextMenu.Root>
                ))}

                {/* NL composer toggle */}
                <button
                    type="button"
                    onClick={() => setShowComposer(!showComposer)}
                    title="Describe a custom focus view"
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium text-twilight-text-muted border border-twilight-border/30 bg-white/[0.03] hover:bg-white/[0.06] transition-colors cursor-pointer"
                    >
                        <Search size={14} />
                        <span className="hidden sm:inline">Custom</span>
                    </button>

                {activeDefinition ? (
                    <button
                        type="button"
                        onClick={handleSaveCurrent}
                        title="Save the current Focus View"
                        className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium text-twilight-text-muted border border-twilight-border/30 bg-white/[0.03] hover:bg-white/[0.06] transition-colors cursor-pointer"
                    >
                        <BookmarkPlus size={14} />
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
                            className="w-full rounded-xl border border-twilight-border/40 bg-white/[0.03] px-4 py-2.5 text-[13px] text-twilight-text placeholder:text-twilight-text-muted/50 outline-none focus:border-lantern/30 focus:ring-1 focus:ring-lantern/20 transition-colors"
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
                        className="shrink-0 rounded-xl bg-lantern/15 px-4 py-2.5 text-[13px] font-medium text-lantern hover:bg-lantern/25 transition-colors disabled:opacity-40 cursor-pointer"
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
                            className="inline-flex items-center rounded-lg bg-lantern/10 border border-lantern/18 px-2.5 py-1 text-[11px] font-medium text-lantern"
                        >
                            {chip}
                        </span>
                    ))}
                </div>
            )}


        </div>
    );
}
