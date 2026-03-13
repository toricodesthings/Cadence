import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "../primitives/Dialog";
import { useCreateHabit } from "../../hooks/habits/use-create-habit";
import { CadencePicker } from "./CadencePicker";
import { createHabitSchema, type CreateHabitValues } from "../../lib/validations/habit-schemas";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CreateHabitDialog({ open, onOpenChange }: Props) {
    const { mutate: createHabit } = useCreateHabit();

    const form = useForm<CreateHabitValues>({
        resolver: zodResolver(createHabitSchema),
        defaultValues: {
            title: "",
            description: "",
            recurrenceRule: "FREQ=DAILY",
            colorAccent: "lantern",
        },
    });

    const onSubmit = (data: CreateHabitValues) => {
        createHabit(data);
        form.reset();
        onOpenChange(false);
    };

    return (
        <Dialog.Dialog open={open} onOpenChange={onOpenChange}>
            <Dialog.DialogContent className="max-w-lg">
                <Dialog.DialogHeader>
                    <Dialog.DialogTitle>New habit</Dialog.DialogTitle>
                    <Dialog.DialogDescription>
                        Define a recurring routine to track in your daily flow.
                    </Dialog.DialogDescription>
                </Dialog.DialogHeader>

                <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5 mt-2">
                    {/* Name */}
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

                    {/* Description */}
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="habit-desc" className="text-[11px] font-semibold uppercase tracking-widest text-twilight-text-muted">
                            Purpose <span className="normal-case tracking-normal font-normal text-twilight-text-muted/40">— optional</span>
                        </label>
                        <textarea
                            id="habit-desc"
                            placeholder="Why are you building this habit?"
                            {...form.register("description")}
                            rows={2}
                            className="w-full rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-3 text-sm text-twilight-text placeholder:text-twilight-text-muted/40 outline-none transition-[border-color,box-shadow] duration-200 focus:border-lantern/30 focus:shadow-[0_0_0_3px_rgba(232,164,74,0.07)] resize-none"
                        />
                        {form.formState.errors.description && (
                            <span className="text-rose-500 text-xs mt-1">{form.formState.errors.description.message}</span>
                        )}
                    </div>

                    {/* Cadence */}
                    <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-semibold uppercase tracking-widest text-twilight-text-muted">
                            Cadence
                        </label>
                        <Controller
                            control={form.control}
                            name="recurrenceRule"
                            render={({ field }) => (
                                <CadencePicker
                                    value={field.value}
                                    onChange={field.onChange}
                                />
                            )}
                        />
                        {form.formState.errors.recurrenceRule && (
                            <span className="text-rose-500 text-xs mt-1">{form.formState.errors.recurrenceRule.message}</span>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={() => {
                                form.reset();
                                onOpenChange(false);
                            }}
                            className="px-4 py-2 rounded-xl text-[13px] text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06] transition-colors duration-200 cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!form.formState.isDirty || form.formState.isSubmitting}
                            className="px-4 py-2 rounded-xl text-[13px] bg-lantern/20 text-lantern hover:bg-lantern/30 transition-colors duration-200 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                        >
                            Create habit
                        </button>
                    </div>
                </form>
            </Dialog.DialogContent>
        </Dialog.Dialog>
    );
}
