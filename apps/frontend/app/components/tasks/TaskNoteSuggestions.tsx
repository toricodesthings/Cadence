import React, { useMemo, useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { deriveNoteSuggestions, type NoteSuggestion } from "../../lib/notes/note-suggestions";

interface TaskNoteSuggestionsProps {
    body: string;
}

/**
 * Quiet, optional suggestion chips that appear in the note room footer.
 * Dismissible, non-intrusive, never mutates user writing.
 */
export function TaskNoteSuggestions({ body }: TaskNoteSuggestionsProps) {
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());

    const suggestions = useMemo(() => deriveNoteSuggestions(body), [body]);

    const visible = suggestions.filter((s) => !dismissed.has(s.id));

    if (visible.length === 0) return null;

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <Lightbulb size={12} className="text-amber-400/60 shrink-0" aria-hidden="true" />
            <AnimatePresence mode="popLayout">
                {visible.map((suggestion) => (
                    <SuggestionChip
                        key={suggestion.id}
                        suggestion={suggestion}
                        onDismiss={() =>
                            setDismissed((prev) => new Set(prev).add(suggestion.id))
                        }
                    />
                ))}
            </AnimatePresence>
        </div>
    );
}

function SuggestionChip({
    suggestion,
    onDismiss,
}: {
    suggestion: NoteSuggestion;
    onDismiss: () => void;
}) {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 bg-white/[0.04] border border-twilight-border text-xs text-twilight-text-muted"
            title={suggestion.description}
        >
            <span className="truncate max-w-[180px]">{suggestion.title}</span>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onDismiss();
                }}
                className="shrink-0 rounded p-0.5 hover:bg-white/[0.08] transition-colors"
                aria-label={`Dismiss suggestion: ${suggestion.title}`}
            >
                <X size={10} />
            </button>
        </motion.div>
    );
}
