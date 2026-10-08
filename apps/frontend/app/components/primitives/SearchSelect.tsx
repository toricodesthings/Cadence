import { useEffect, useMemo, useRef, useState } from "react";
import { Select, SelectContent, SelectItem, SelectSearch, SelectTrigger, SelectValue } from "./Select";

export interface SearchSelectOption {
    value: string;
    label: string;
}

/** Lowercase, accents and underscores dropped, so "turkiye" finds Türkiye and "new york" finds New_York. */
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").replace(/_/g, " ").toLowerCase();

/**
 * A `Select` for lists too long to scan (countries, regions, time zones): a search box narrows it as you
 * type. `pinned` options lead the list ("Use my time zone"), and the chosen one stays listed while searching.
 */
export function SearchSelect({ value, onValueChange, options, pinned = [], ariaLabel, searchLabel, placeholder, disabled }: {
    value: string;
    onValueChange: (value: string) => void;
    options: ReadonlyArray<SearchSelectOption>;
    pinned?: ReadonlyArray<SearchSelectOption>;
    ariaLabel: string;
    searchLabel: string;
    placeholder?: string;
    disabled?: boolean;
}) {
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    const needle = fold(query.trim());
    const all = useMemo(() => [...pinned, ...options], [pinned, options]);
    const hits = needle ? all.filter((option) => fold(option.label).includes(needle)) : all;
    const shown = all.filter((option) => hits.includes(option) || option.value === value);

    // Radix focuses the selected item on open; steal focus back for the search box one frame later.
    useEffect(() => {
        if (!open) { setQuery(""); return; }
        const id = requestAnimationFrame(() => searchRef.current?.focus());
        return () => cancelAnimationFrame(id);
    }, [open]);

    return (
        <Select value={value} onValueChange={onValueChange} open={open} onOpenChange={setOpen} disabled={disabled}>
            <SelectTrigger aria-label={ariaLabel}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                <SelectSearch ref={searchRef} aria-label={searchLabel} placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} />
                {needle && hits.length === 0 && <p className="px-3 py-2 text-sm text-twilight-text-soft">No matches</p>}
                {shown.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
        </Select>
    );
}
