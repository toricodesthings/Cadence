import { Sparkles } from "lucide-react";
import { useDidYouMean } from "../../hooks/search/use-did-you-mean";

/** One quiet row under "No results": the task the user probably meant. Renders nothing otherwise. */
export function DidYouMean({ query, onOpen }: { query: string; onOpen: (task: { id: string; title: string }) => void }) {
    const task = useDidYouMean(query);
    if (!task) return null;
    return (
        <button
            type="button"
            onClick={() => onOpen(task)}
            className="mx-auto mt-3 flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-2xl px-4 py-2 text-left text-sm text-twilight-text-soft transition-colors hover:bg-white/[0.04] hover:text-twilight-text"
        >
            <Sparkles size={14} className="shrink-0 text-accent-primary" aria-hidden />
            {/* The title is the point of the row, so it wraps (up to two lines) rather than cutting off on a phone. */}
            <span className="line-clamp-2 break-words">
                Did you mean <span className="font-medium text-twilight-text">{task.title}</span>?
            </span>
        </button>
    );
}
