export function AppInitials({ initials }: { initials: string }) {
    return (
        <span
            aria-hidden="true"
            className="grid size-9 bg-white/[0.05] shrink-0 select-none place-items-center rounded-xl font-sans text-[12px] font-semibold text-twilight-text-soft"
        >
            {initials}
        </span>
    );
}
