import type { InboxItem } from "../../types/inbox";
import { useDeleteInboxItem } from "../../hooks/inbox/use-delete-inbox-item";

interface InboxItemCardProps {
    item: InboxItem;
}

export function InboxItemCard({ item }: InboxItemCardProps) {
    const deleteItem = useDeleteInboxItem();

    return (
        <div data-focus-kind="inbox" data-focus-id={item.id} className="group relative flex items-center gap-3 py-3 px-4 -mx-4 rounded-xl hover:bg-white/[0.03] transition-colors border border-transparent hover:border-twilight-border-light cursor-default">
            <div className="flex-1 min-w-0">
                <p className="text-[15px] text-twilight-text leading-relaxed whitespace-pre-wrap break-words">
                    {item.rawText}
                </p>
                <div className="flex gap-3 mt-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button
                        className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-lantern/10 text-lantern hover:bg-lantern/20 transition-colors cursor-pointer ring-1 ring-lantern/20"
                    >
                        Process to Task
                    </button>
                    <button
                        onClick={() => deleteItem.mutate(item.id)}
                        disabled={deleteItem.isPending}
                        className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-twilight-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                    >
                        {deleteItem.isPending ? "Deleting..." : "Delete"}
                    </button>
                </div>
            </div>
            <div className="text-xs font-medium text-twilight-text-muted/90 uppercase tracking-widest whitespace-nowrap self-start mt-1">
                {new Date(item.createdAt).toLocaleDateString()}
            </div>
        </div>
    );
}
