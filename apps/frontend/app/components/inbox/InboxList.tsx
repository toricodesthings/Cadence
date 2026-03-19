import type { InboxItem } from "../../types/inbox";
import { InboxItemCard } from "./InboxItemCard";

interface InboxListProps {
    items: InboxItem[];
    selectedItemId?: string | null;
    onSelectItem?: (itemId: string) => void;
}

export function InboxList({ items, selectedItemId, onSelectItem }: InboxListProps) {
    if (!items.length) {
        return null;
    }

    return (
        <div className="flex flex-col gap-1 w-full max-w-2xl mx-auto divide-y divide-twilight-border-light">
            {items.map((item) => (
                <InboxItemCard
                    key={item.id}
                    item={item}
                    isSelected={selectedItemId === item.id}
                    onSelect={onSelectItem}
                />
            ))}
        </div>
    );
}
