import { motion } from "framer-motion";
import { CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "../primitives/Button";
import type { LucideIcon } from "lucide-react";

interface CardAction {
    label: string;
    icon: LucideIcon;
    onClick: () => Promise<void> | void;
    variant?: "cardPrimary" | "card" | "cardDanger";
}

export function ReviewCard({
    title,
    actionKeyPrefix,
    actions,
    pendingActionKey,
    actionError,
    onRunAction,
}: {
    title: string;
    actionKeyPrefix: string;
    actions: CardAction[];
    pendingActionKey: string | null;
    actionError: string | null;
    onRunAction: (actionKey: string, actionFn: () => Promise<void>) => void;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 1.05 }}
            key={title}
            className="bg-twilight-surface/40 backdrop-blur-xl border border-twilight-border rounded-[32px] p-10 max-w-lg w-full mx-auto shadow-2xl flex flex-col items-center justify-center text-center relative overflow-hidden group"
        >
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
            <h3 className="text-2xl font-display font-medium text-twilight-text mb-12 leading-relaxed">
                &ldquo;{title}&rdquo;
            </h3>

            {actionError ? (
                <p className="mb-6 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {actionError}
                </p>
            ) : null}

            <div className="grid grid-cols-2 gap-4 w-full">
                {actions.map((act, i) => {
                    const ActIcon = act.icon;
                    const actionKey = `${actionKeyPrefix}:${i}`;
                    const isPending = pendingActionKey === actionKey;
                    return (
                        <Button
                            key={i}
                            variant={act.variant ?? "card"}
                            size="card"
                            onClick={() => void onRunAction(actionKey, async () => { await act.onClick(); })}
                            disabled={Boolean(pendingActionKey)}
                        >
                            <ActIcon size={20} strokeWidth={2} />
                            <span className="font-medium">{isPending ? "Working..." : act.label}</span>
                        </Button>
                    );
                })}
            </div>
        </motion.div>
    );
}

export function ReviewEmptyState({ title, subtitle, onNext }: { title: string; subtitle: string; onNext: () => void }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center text-center py-16"
        >
            <div className="w-20 h-20 rounded-full bg-accent-primary/10 flex items-center justify-center mb-6 glow-lantern">
                <CheckCircle size={32} className="text-accent-primary" />
            </div>
            <h2 className="text-3xl font-display font-semibold text-twilight-text mb-3">{title}</h2>
            <p className="text-twilight-text-muted mb-10 max-w-sm">{subtitle}</p>
            <Button variant="primary" size="lg" onClick={onNext}>
                Continue <ArrowRight size={18} />
            </Button>
        </motion.div>
    );
}
