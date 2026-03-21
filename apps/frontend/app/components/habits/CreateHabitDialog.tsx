import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Clock, FolderOpen, Tag } from "lucide-react";
import * as Dialog from "../primitives/Dialog";
import { useCreateHabit } from "../../hooks/habits/use-create-habit";
import { useProjects } from "../../hooks/projects/use-projects";
import { useTags } from "../../hooks/tags/use-tags";
import { CadencePicker } from "./CadencePicker";
import { createHabitSchema, type CreateHabitValues } from "../../lib/validations/habit-schemas";

const HABIT_STARTER_PACKS: Array<{
    id: string;
    title: string;
    description: string;
    recurrenceRule: string;
}> = [
    {
        id: "morning-review",
        title: "Morning review",
        description: "Check Today, clear Holding, and start with intention.",
        recurrenceRule: "FREQ=DAILY",
    },
    {
        id: "workout-split",
        title: "Workout split",
        description: "Keep a steady training rhythm across the week.",
        recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
    },
    {
        id: "hydration",
        title: "Hydration",
        description: "A small daily reset that keeps the baseline healthy.",
        recurrenceRule: "FREQ=DAILY",
    },
    {
        id: "reading",
        title: "Reading",
        description: "Build a calm evening reading habit.",
        recurrenceRule: "FREQ=DAILY",
    },
];

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CreateHabitDialog({ open, onOpenChange }: Props) {
    const { mutate: createHabit } = useCreateHabit();
    const { data: projects = [] } = useProjects();
    const { data: tags = [] } = useTags();

    const [showTiming, setShowTiming] = useState(false);
    const [showConnections, setShowConnections] = useState(false);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

    const form = useForm<CreateHabitValues>({
        resolver: zodResolver(createHabitSchema),
        defaultValues: {
            title: "",
            description: "",
            recurrenceRule: "FREQ=DAILY",
            colorAccent: "lantern",
            targetTime: null,
            reminderEnabled: false,
            projectId: null,
            tagIds: [],
        },
    });

    const watchTargetTime = form.watch("targetTime");

    const handleClose = () => {
        form.reset();
        setShowTiming(false);
        setShowConnections(false);
        setSelectedTagIds([]);
        onOpenChange(false);
    };

    const onSubmit = (data: CreateHabitValues) => {
        createHabit({
            ...data,
            tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        });
        handleClose();
    };

    const toggleTag = (tagId: string) => {
        setSelectedTagIds((prev) =>
            prev.includes(tagId)
                ? prev.filter((id) => id !== tagId)
                : [...prev, tagId]
        );
    };

    return (
        <Dialog.Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(true); }}>
            <Dialog.DialogContent className="max-w-lg">
                <Dialog.DialogHeader>
                    <Dialog.DialogTitle>New routine</Dialog.DialogTitle>
                    <Dialog.DialogDescription>
                        Start with a name — add timing and connections when you're ready.
                    </Dialog.DialogDescription>
                </Dialog.DialogHeader>

                <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5 mt-2">
                    {/* Starter packs */}
                    <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-semibold uppercase tracking-widest text-twilight-text-muted">
                            Starter packs
                        </label>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {HABIT_STARTER_PACKS.map((preset) => (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => {
                                        form.setValue("title", preset.title, { shouldDirty: true });
                                        form.setValue("description", preset.description, { shouldDirty: true });
                                        form.setValue("recurrenceRule", preset.recurrenceRule, { shouldDirty: true });
                                    }}
                                    className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-left transition-colors hover:bg-white/[0.05] hover:border-lantern/20"
                                >
                                    <p className="text-sm font-medium text-twilight-text">{preset.title}</p>
                                    <p className="mt-1 text-xs leading-relaxed text-twilight-text-muted">{preset.description}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Level 1: Name + Cadence (always visible) */}
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="habit-title" className="text-[11px] font-semibold uppercase tracking-widest text-twilight-text-muted">
                            Name
                        </label>
                        <input
                            id="habit-title"
                            autoFocus
                            placeholder="e.g. Morning walk, Read 20 pages…"
                            {...form.register("title")}
                            className="w-full rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-3 text-sm text-twilight-text placeholder:text-twilight-text-muted/40 outline-none transition-[border-color,box-shadow] duration-200 focus:border-lantern/30 focus:shadow-[0_0_0_3px_rgba(232,164,74,0.07)]"
                        />
                        {form.formState.errors.title && (
                            <span className="text-rose-500 text-xs mt-1">{form.formState.errors.title.message}</span>
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-semibold uppercase tracking-widest text-twilight-text-muted">
                            Cadence
                        </label>
                        <Controller
                            control={form.control}
                            name="recurrenceRule"
                            render={({ field }) => (
                                <CadencePicker value={field.value} onChange={field.onChange} />
                            )}
                        />
                    </div>

                    {/* Level 2: Timing disclosure */}
                    <div className="flex flex-col gap-3">
                        <button
                            type="button"
                            onClick={() => setShowTiming((v) => !v)}
                            className="flex items-center gap-2 text-left group"
                        >
                            <Clock size={13} className="text-twilight-text-muted/60" />
                            <span className="text-[12px] font-medium text-twilight-text-soft group-hover:text-twilight-text transition-colors">
                                Timing &amp; reminder
                            </span>
                            {!showTiming && watchTargetTime && (
                                <span className="text-[11px] text-twilight-text-muted/70 ml-1">
                                    — {watchTargetTime}{form.watch("reminderEnabled") ? ", reminder on" : ""}
                                </span>
                            )}
                            <motion.div animate={{ rotate: showTiming ? 180 : 0 }} transition={{ duration: 0.15 }}>
                                <ChevronDown size={12} className="text-twilight-text-muted/50" />
                            </motion.div>
                        </button>

                        <AnimatePresence initial={false}>
                            {showTiming && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                                    className="overflow-hidden"
                                >
                                    <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                                        <div className="flex flex-col gap-1.5">
                                            <label htmlFor="habit-time" className="text-[11px] font-semibold uppercase tracking-widest text-twilight-text-muted">
                                                Target time <span className="normal-case tracking-normal font-normal text-twilight-text-muted/40">— optional</span>
                                            </label>
                                            <div className="flex gap-2">
                                                <input
                                                    id="habit-time"
                                                    type="time"
                                                    {...form.register("targetTime")}
                                                    className="flex-1 rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-2.5 text-sm text-twilight-text outline-none transition-[border-color,box-shadow] duration-200 focus:border-lantern/30 focus:shadow-[0_0_0_3px_rgba(232,164,74,0.07)]"
                                                />
                                                {watchTargetTime && (
                                                    <button
                                                        type="button"
                                                        onClick={() => form.setValue("targetTime", null)}
                                                        className="px-3 py-2 rounded-xl text-[12px] text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06] transition-colors"
                                                    >
                                                        Clear
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {watchTargetTime && (
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    {...form.register("reminderEnabled")}
                                                    className="h-5 w-5 rounded-lg border-white/[0.15] bg-white/[0.05] text-lantern focus:ring-lantern/40 accent-[var(--color-lantern)]"
                                                />
                                                <span className="text-sm text-twilight-text-soft">
                                                    Remind me at this time
                                                </span>
                                            </label>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Level 3: Connections disclosure */}
                    <div className="flex flex-col gap-3">
                        <button
                            type="button"
                            onClick={() => setShowConnections((v) => !v)}
                            className="flex items-center gap-2 text-left group"
                        >
                            <FolderOpen size={13} className="text-twilight-text-muted/60" />
                            <span className="text-[12px] font-medium text-twilight-text-soft group-hover:text-twilight-text transition-colors">
                                Project, tags &amp; purpose
                            </span>
                            {!showConnections && (() => {
                                const parts: string[] = [];
                                const pid = form.watch("projectId");
                                if (pid) {
                                    const proj = projects.find(p => p.id === pid);
                                    if (proj) parts.push(proj.name);
                                }
                                if (selectedTagIds.length > 0) parts.push(`${selectedTagIds.length} tag${selectedTagIds.length > 1 ? "s" : ""}`);
                                return parts.length > 0 ? (
                                    <span className="text-[11px] text-twilight-text-muted/70 ml-1 truncate">
                                        — {parts.join(", ")}
                                    </span>
                                ) : null;
                            })()}
                            <motion.div animate={{ rotate: showConnections ? 180 : 0 }} transition={{ duration: 0.15 }}>
                                <ChevronDown size={12} className="text-twilight-text-muted/50" />
                            </motion.div>
                        </button>

                        <AnimatePresence initial={false}>
                            {showConnections && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                                    className="overflow-hidden"
                                >
                                    <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                                        {/* Purpose */}
                                        <div className="flex flex-col gap-1.5">
                                            <label htmlFor="habit-desc" className="text-[11px] font-semibold uppercase tracking-widest text-twilight-text-muted">
                                                Purpose <span className="normal-case tracking-normal font-normal text-twilight-text-muted/40">— optional</span>
                                            </label>
                                            <textarea
                                                id="habit-desc"
                                                placeholder="Why are you building this routine?"
                                                {...form.register("description")}
                                                rows={2}
                                                className="w-full rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-3 text-sm text-twilight-text placeholder:text-twilight-text-muted/40 outline-none transition-[border-color,box-shadow] duration-200 focus:border-lantern/30 focus:shadow-[0_0_0_3px_rgba(232,164,74,0.07)] resize-none"
                                            />
                                        </div>

                                        {/* Project link */}
                                        {projects.length > 0 && (
                                            <div className="flex flex-col gap-1.5">
                                                <label htmlFor="habit-project" className="text-[11px] font-semibold uppercase tracking-widest text-twilight-text-muted">
                                                    Link to project
                                                </label>
                                                <select
                                                    id="habit-project"
                                                    {...form.register("projectId")}
                                                    className="w-full rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-2.5 text-sm text-twilight-text outline-none transition-[border-color,box-shadow] duration-200 focus:border-lantern/30 focus:shadow-[0_0_0_3px_rgba(232,164,74,0.07)] appearance-none"
                                                >
                                                    <option value="">None</option>
                                                    {projects.map((p) => (
                                                        <option key={p.id} value={p.id}>
                                                            {p.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {/* Tags */}
                                        {tags.length > 0 && (
                                            <div className="flex flex-col gap-2">
                                                <label className="text-[11px] font-semibold uppercase tracking-widest text-twilight-text-muted">
                                                    Tags
                                                </label>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {tags.map((tag) => {
                                                        const selected = selectedTagIds.includes(tag.id);
                                                        return (
                                                            <button
                                                                key={tag.id}
                                                                type="button"
                                                                onClick={() => toggleTag(tag.id)}
                                                                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                                                                    selected
                                                                        ? "bg-lantern/15 text-lantern border border-lantern/25"
                                                                        : "bg-white/[0.04] text-twilight-text-muted border border-white/[0.08] hover:bg-white/[0.07] hover:text-twilight-text"
                                                                }`}
                                                            >
                                                                <Tag size={10} />
                                                                {tag.name}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="px-4 py-2 rounded-xl text-[13px] text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06] transition-colors duration-200 cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!form.formState.isDirty || form.formState.isSubmitting}
                            className="px-4 py-2 rounded-xl text-[13px] bg-lantern/20 text-lantern hover:bg-lantern/30 transition-colors duration-200 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                        >
                            Create routine
                        </button>
                    </div>
                </form>
            </Dialog.DialogContent>
        </Dialog.Dialog>
    );
}
