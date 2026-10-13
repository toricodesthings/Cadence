import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import type { LinkedAppId } from "@cadence/contracts/app-link";
import { SearchField } from "../primitives/SearchField";
import { Button } from "../primitives/Button";
import * as Popover from "../primitives/Popover";
import { UtilitySheet } from "./UtilitySheet";
import { AppInitials } from "./AppInitials";
import { AppAnchor } from "./AppLaunchLink";
import { APP_CATALOG, CATEGORY_LABEL, appEntry, type AppEntry } from "../../lib/app-links/catalog";
import { createAppSearch, pickerSections, suggestForTitle } from "../../lib/app-links/picker";
import { resolveAppLaunch } from "../../platform/app-links";

/** What this device can offer: the entries with a route here. */
export function useAvailableApps(): AppEntry[] {
    return useMemo(() => APP_CATALOG.filter((entry) => resolveAppLaunch(entry)), []);
}

const ROW = "surface-row flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";

function AppRow({ entry, selected, onSelect }: { entry: AppEntry; selected: boolean; onSelect: () => void }) {
    const launch = resolveAppLaunch(entry);
    return (
        <li>
            <button type="button" className={ROW} onClick={onSelect}>
                <AppInitials initials={entry.initials} />
                <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium text-twilight-text">{entry.label}</span>
                    <span className="text-xs text-twilight-text-muted">
                        {CATEGORY_LABEL[entry.category].purpose}{launch?.opens === "website" ? " · Opens website" : ""}
                    </span>
                </span>
                {selected ? <><Check size={18} aria-hidden="true" className="shrink-0 text-accent-primary" /><span className="sr-only">Selected</span></> : null}
            </button>
        </li>
    );
}

/**
 * The picker's contents, once: heading-less list over search. Mount it only while open: the title's
 * suggestions are read at mount and held for the visit, and the query starts blank.
 */
function AppPickerList({ title, kind, currentId, nlpEnabled, query, onClearQuery, onSelect, onRemove }: {
    title: string;
    kind: "task" | "routine";
    currentId: string | null | undefined;
    nlpEnabled: boolean;
    query: string;
    onClearQuery: () => void;
    onSelect: (id: LinkedAppId) => void;
    onRemove: () => void;
}) {
    const available = useAvailableApps();
    const [suggested] = useState(() => nlpEnabled ? suggestForTitle(title, available) : { ids: [] });
    const search = useMemo(() => createAppSearch(available), [available]);
    const results = query.trim() ? search(query) : null;
    const sections = useMemo(() => pickerSections(available, currentId, suggested, kind), [available, currentId, suggested, kind]);

    // A short pause before announcing the count, so typing isn't read letter by letter.
    const [announced, setAnnounced] = useState("");
    const lastCount = useRef(-1);
    useEffect(() => {
        if (results === null) { lastCount.current = -1; setAnnounced(""); return; }
        const timer = window.setTimeout(() => {
            if (lastCount.current === results.length) return;
            lastCount.current = results.length;
            setAnnounced(results.length ? `${results.length} ${results.length === 1 ? "app" : "apps"}` : "No matching apps");
        }, 400);
        return () => window.clearTimeout(timer);
    }, [results]);

    const current = appEntry(currentId);
    const unavailable = Boolean(currentId) && !available.some((entry) => entry.id === currentId);
    const website = current ? resolveAppLaunch(current)?.website : null;
    const pick = (entry: AppEntry) => onSelect(entry.id);

    return (
        <div className="flex min-h-0 flex-col gap-3">
            <p role="status" className="sr-only">{announced}</p>

            {!available.length ? (
                <p className="px-1 py-3 text-sm text-twilight-text-soft">No supported apps are available here yet</p>
            ) : results ? (
                results.length ? (
                    <ul className="flex flex-col gap-1">{results.map((entry) => <AppRow key={entry.id} entry={entry} selected={entry.id === currentId} onSelect={() => pick(entry)} />)}</ul>
                ) : (
                    <div className="flex flex-col items-start gap-1 px-1 py-2">
                        <p className="text-sm text-twilight-text-soft">No supported app matches “{query.trim()}”</p>
                        <Button variant="ghost" size="md" onClick={onClearQuery}>Clear search</Button>
                    </div>
                )
            ) : (
                <>
                    {unavailable ? (
                        <p className="surface-row rounded-xl px-3 py-3 text-sm text-twilight-text-soft">
                            App unavailable on this device. Choose another app, or remove it.
                        </p>
                    ) : null}
                    {sections.map((section) => (
                        <section key={section.key} aria-label={section.heading} className="flex flex-col gap-1">
                            {section.heading ? <h3 className="px-1 pt-1 text-xs font-semibold text-twilight-text-muted">{section.heading}</h3> : null}
                            <ul className="flex flex-col gap-1">
                                {section.apps.map((entry) => <AppRow key={entry.id} entry={entry} selected={entry.id === currentId} onSelect={() => pick(entry)} />)}
                            </ul>
                        </section>
                    ))}
                </>
            )}

            {currentId ? (
                <div className="flex flex-col items-start gap-1 border-t border-twilight-border/25 pt-2">
                    {website && current ? (
                        <p className="px-1 text-xs text-twilight-text-muted">
                            App didn’t open? Try its website.{" "}
                            <AppAnchor href={website} opens="website" className="cursor-pointer text-twilight-text-soft underline underline-offset-2">Open {current.label} website</AppAnchor>
                        </p>
                    ) : null}
                    <Button variant="ghost" size="md" onClick={onRemove}>Remove app</Button>
                </div>
            ) : null}
        </div>
    );
}

interface AppPickerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    compact: boolean;
    title: string;
    kind: "task" | "routine";
    currentId: string | null | undefined;
    nlpEnabled: boolean;
    onSelect: (id: LinkedAppId) => void;
    onRemove: () => void;
    /** The desktop popover's anchor: the field's value button. */
    children: React.ReactNode;
}

/**
 * Choose app: a sheet on compact, a popover from the field on desktop. The search stays pinned above the
 * scrolling list. Choosing saves and closes; it never opens the app.
 */
export function AppPicker({ open, onOpenChange, compact, title, kind, currentId, nlpEnabled, onSelect, onRemove, children }: AppPickerProps) {
    const [query, setQuery] = useState("");
    const available = useAvailableApps();
    const search = useMemo(() => createAppSearch(available), [available]);
    // Every visit starts blank.
    useEffect(() => { if (!open) setQuery(""); }, [open]);
    const noMatch = Boolean(query.trim()) && search(query).length === 0;

    const done = (action: () => void) => { action(); onOpenChange(false); };
    const field = (autoFocus: boolean) => (
        <SearchField value={query} onValueChange={setQuery} aria-label="Find an app" placeholder="Find an app" autoFocus={autoFocus} clearable={!noMatch} />
    );
    const list = (
        <AppPickerList
            title={title} kind={kind} currentId={currentId} nlpEnabled={nlpEnabled} query={query} onClearQuery={() => setQuery("")}
            onSelect={(id) => done(() => { if (id !== currentId) onSelect(id); })}
            onRemove={() => done(onRemove)}
        />
    );

    if (compact) {
        return (
            <>
                {children}
                <UtilitySheet
                    open={open}
                    onClose={() => onOpenChange(false)}
                    title="Choose app"
                    subtitle={title}
                    band={open ? (
                        <div className="flex flex-col gap-2 border-b border-twilight-border px-4 py-3">
                            <p className="text-sm text-twilight-text-soft">Choose an app you already use.</p>
                            {field(false)}
                        </div>
                    ) : null}
                >
                    {open ? list : null}
                </UtilitySheet>
            </>
        );
    }
    return (
        <Popover.Root open={open} onOpenChange={onOpenChange}>
            <Popover.Trigger asChild>{children}</Popover.Trigger>
            <Popover.Content align="end" className="flex max-h-[min(32rem,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-hidden p-3" aria-label="Choose app">
                <div className="px-1">
                    <h2 className="font-display text-base font-semibold text-twilight-text">Choose app</h2>
                    <p className="text-xs text-twilight-text-muted">Choose an app you already use.</p>
                </div>
                {open ? field(true) : null}
                <div className="min-h-0 flex-1 overflow-y-auto">{open ? list : null}</div>
            </Popover.Content>
        </Popover.Root>
    );
}
