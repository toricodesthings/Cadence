import { Plus } from "lucide-react";

export function HeaderAddButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className="surface-control-accent inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-accent-primary/20 px-3.5 text-sm font-medium text-accent-primary transition-colors hover:border-accent-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
        >
            <Plus size={14} aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
        </button>
    );
}
