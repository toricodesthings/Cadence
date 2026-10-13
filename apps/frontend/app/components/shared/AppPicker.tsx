import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Globe } from "lucide-react";
import { parseWebsite } from "@cadence/contracts/app-link";
import type { LinkedAppId } from "@cadence/contracts/app-link";
import { SearchField } from "../primitives/SearchField";
import { Button } from "../primitives/Button";
import { AppInitials } from "./AppInitials";
import { AppAnchor, OPEN_PILL, OpenPill } from "./AppLaunchLink";
import { APP_CATALOG, CATEGORY_LABEL, appEntry, type AppEntry } from "../../lib/app-links/catalog";
import { createAppSearch, pickerSections, suggestForTitle } from "../../lib/app-links/picker";
import { resolveAppLaunch, resolveWebsite } from "../../platform/app-links";

/** What this device can offer: the entries with a route here. */
export function useAvailableApps(): AppEntry[] {
    return useMemo(() => APP_CATALOG.filter((entry) => resolveAppLaunch(entry)), []);
}

const ROW = "flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";

/** `markWebsite`: some apps here open natively, so a website-only one says so. Where every app is a website, nothing repeats it. */
function AppRow({ entry, selected, markWebsite, onSelect }: { entry: AppEntry; selected: boolean; markWebsite: boolean; onSelect: () => void }) {
    const launch = resolveAppLaunch(entry);
    return (
        <li>
            <button type="button" className={`${ROW} ${selected ? "bg-accent-primary/[0.07]" : ""}`} onClick={onSelect}>
                <AppInitials initials={entry.initials} />
                <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-twilight-text">{entry.label}</span>
                    <span className="truncate text-xs text-twilight-text-muted">
                        {CATEGORY_LABEL[entry.category].purpose}{markWebsite && launch?.opens === "website" ? " · Opens website" : ""}
                    </span>
                </span>
                {selected ? <><Check size={18} aria-hidden="true" className="shrink-0 text-accent-primary" /><span className="sr-only">Selected</span></> : null}
            </button>
        </li>
    );
}

/** The globe tile: a website is not an app, so it never wears initials. */
export function WebsiteTile() {
    return (
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl border border-dashed border-accent-primary/40 bg-accent-primary/[0.08] text-accent-primary">
            <Globe size={16} />
        </span>
    );
}

/**
 * Website: set apart from the apps (dashed, globe). It unfolds into one address field that starts at
 * `https://`. Open saves and opens it in the browser; Enter saves. Only an address `parseWebsite` accepts
 * becomes a link, so nothing but https ever leaves Cadence.
 */
function WebsiteOption({ current, onSave }: { current: string | null; onSave: (url: string, opening: boolean) => void }) {
    const [editing, setEditing] = useState(Boolean(current));
    const [text, setText] = useState(current ?? "https://");
    const [tried, setTried] = useState(false);
    const field = useRef<HTMLInputElement>(null);
    // A new website starts typing after "https://"; an existing one is left for the person to select or edit.
    useEffect(() => {
        if (!editing || current || !field.current) return;
        field.current.focus();
        field.current.setSelectionRange(field.current.value.length, field.current.value.length);
    }, [editing, current]);
    const url = parseWebsite(text);
    const label = url ? resolveWebsite(url)?.label : null;

    if (!editing) {
        return (
            <button type="button" onClick={() => setEditing(true)}
                className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-twilight-border/60 px-2 py-2 text-left transition-colors hover:border-accent-primary/40 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50">
                <WebsiteTile />
                <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium text-twilight-text">Website</span>
                    <span className="text-xs text-twilight-text-muted">Any address · Opens in your browser</span>
                </span>
            </button>
        );
    }
    return (
        <form
            noValidate
            onSubmit={(event) => { event.preventDefault(); setTried(true); if (url) onSave(url, false); }}
            className="flex flex-col gap-2 rounded-xl border border-dashed border-accent-primary/40 bg-accent-primary/[0.04] p-2"
        >
            <div className="flex items-center gap-3">
                <WebsiteTile />
                <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium text-twilight-text">Website</span>
                    <span className="truncate text-xs text-twilight-text-muted">{label ? `Opens ${label} in your browser` : "Type the address to open"}</span>
                </span>
            </div>
            <div className="flex items-center gap-2">
                <input
                    type="url"
                    inputMode="url"
                    aria-label="Website address"
                    aria-invalid={tried && !url ? true : undefined}
                    aria-describedby={tried && !url ? "website-error" : undefined}
                    autoComplete="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={2048}
                    ref={field}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    className="min-h-11 min-w-0 flex-1 rounded-xl border border-twilight-border/40 bg-white/[0.03] px-3 text-sm text-twilight-text placeholder:text-twilight-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                />
                {url ? (
                    <OpenPill href={url} opens="website" label={`Open ${label}`} onClick={() => onSave(url, true)} />
                ) : (
                    <Button type="submit" variant="cardPrimary" size="sm" className={`${OPEN_PILL} opacity-50`} aria-label="Open website" onClick={() => setTried(true)}>Open</Button>
                )}
            </div>
            {tried && !url ? <p id="website-error" className="px-1 text-xs text-feedback-error">Use a full https:// address, like https://example.com</p> : null}
        </form>
    );
}

/**
 * The chooser inside the App pane: search over the list (current choice, the title's suggestions, the rest
 * A→Z). Mount it only while the pane is open: suggestions are read at mount and held for the visit, and
 * the query starts blank. Choosing saves; it never opens the app.
 */
export function AppChooser({ title, kind, currentId, currentUrl, nlpEnabled, onSelect, onWebsite, onRemove }: {
    title: string;
    kind: "task" | "routine";
    currentId: string | null | undefined;
    /** The saved website, already re-checked (`resolveWebsite`). */
    currentUrl: string | null;
    nlpEnabled: boolean;
    onSelect: (id: LinkedAppId) => void;
    onWebsite: (url: string, opening: boolean) => void;
    onRemove: () => void;
}) {
    const available = useAvailableApps();
    const [query, setQuery] = useState("");
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
    const markWebsite = available.some((entry) => resolveAppLaunch(entry)?.opens === "app");
    const row = (entry: AppEntry) => <AppRow key={entry.id} entry={entry} selected={entry.id === currentId} markWebsite={markWebsite} onSelect={() => onSelect(entry.id)} />;
    const noMatch = results !== null && results.length === 0;

    return (
        <div className="flex flex-col gap-3">
            <p role="status" className="sr-only">{announced}</p>
            <WebsiteOption current={currentUrl} onSave={onWebsite} />
            {available.length ? <SearchField value={query} onValueChange={setQuery} aria-label="Find an app" placeholder="Find an app" clearable={!noMatch} /> : null}

            {!available.length ? (
                <p className="px-1 py-2 text-sm text-twilight-text-soft">No supported apps are available here yet</p>
            ) : results ? (
                results.length ? <ul className="flex flex-col gap-0.5">{results.map(row)}</ul> : (
                    <div className="flex flex-col items-start gap-1 px-1">
                        <p className="text-sm text-twilight-text-soft">No supported app matches “{query.trim()}”</p>
                        <Button variant="ghost" size="sm" onClick={() => setQuery("")}>Clear search</Button>
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
                        <section key={section.key} aria-label={section.heading} className="flex flex-col gap-0.5">
                            {section.heading ? <h3 className="px-2 pt-1 text-xs font-semibold text-twilight-text-muted">{section.heading}</h3> : null}
                            <ul className="flex flex-col gap-0.5">{section.apps.map(row)}</ul>
                        </section>
                    ))}
                </>
            )}

            {currentId || currentUrl ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-twilight-border/25 pt-2">
                    {website && current ? (
                        <AppAnchor href={website} opens="website" className="cursor-pointer px-1 text-xs text-twilight-text-muted underline underline-offset-2 hover:text-twilight-text-soft">
                            App didn’t open? Use the website
                        </AppAnchor>
                    ) : <span />}
                    <Button variant="ghost" size="sm" onClick={onRemove}>{currentId ? "Remove app" : "Remove website"}</Button>
                </div>
            ) : null}
        </div>
    );
}
