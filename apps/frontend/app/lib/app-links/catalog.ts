import type { LinkedAppId } from "@cadence/contracts/app-link";
import type { AppCategory } from "@cadence/nlp/app-suggestions";

/** Where one tap goes. `opens` is what the tap is allowed to claim: a custom scheme or a website. */
export interface AppRoute {
    href: string;
    opens: "app" | "website";
    /** True only once the exact destination was exercised on a device and recorded in docs/updates/0.33.0.md. */
    verified: boolean;
}

export interface AppEntry {
    id: LinkedAppId;
    label: string;
    /** Fixed, never derived from the label: the tile beside the full name. */
    initials: string;
    category: AppCategory;
    /** Other names someone types for it. */
    aliases: readonly string[];
    /** Words that describe what it is for, beyond its category. */
    terms: readonly string[];
    routes: {
        /** iPhone and iPad (installed app or browser tab). */
        ios?: AppRoute;
        /** Everywhere else, desktop included: the HTTPS destination, never a title or identity in the URL. */
        web?: AppRoute;
    };
}

export const CATEGORY_LABEL: Record<AppCategory, { purpose: string; heading: string }> = {
    email: { purpose: "Email", heading: "email" },
    food: { purpose: "Food tracking", heading: "food tracking" },
    calendar: { purpose: "Calendar", heading: "calendar" },
    maps: { purpose: "Maps", heading: "maps" },
    music: { purpose: "Music", heading: "music" },
    notes: { purpose: "Notes", heading: "notes" },
    video: { purpose: "Video", heading: "video" },
};

const web = (href: string): AppRoute => ({ href, opens: "website", verified: false });

/**
 * The supported destinations, not what is installed. Only MyFitnessPal's `mfp://` on iPhone was exercised
 * (the vendor's iOS SDK documents the scheme; the owner's installed iPhone PWA opened it). Every `web` route
 * is a candidate: it stays out of the picker in production builds until `verified` is set true with its
 * evidence in the plan's validation table.
 */
export const APP_CATALOG: readonly AppEntry[] = [
    {
        id: "google-calendar", label: "Google Calendar", initials: "GC", category: "calendar",
        aliases: ["gcal", "google cal"], terms: ["agenda", "events"],
        routes: { web: web("https://calendar.google.com/") },
    },
    {
        id: "google-maps", label: "Google Maps", initials: "GM", category: "maps",
        aliases: ["gmaps", "google map"], terms: ["directions", "navigate", "places"],
        routes: { web: web("https://www.google.com/maps/@?api=1&map_action=map") },
    },
    {
        id: "gmail", label: "Gmail", initials: "G", category: "email",
        aliases: ["google mail", "g mail"], terms: ["email", "inbox", "mail"],
        routes: { web: web("https://mail.google.com/") },
    },
    {
        id: "myfitnesspal", label: "MyFitnessPal", initials: "MFP", category: "food",
        aliases: ["mfp", "my fitness pal"], terms: ["calories", "log food", "meals", "diet", "macros", "nutrition"],
        routes: {
            ios: { href: "mfp://", opens: "app", verified: true },
            web: web("https://www.myfitnesspal.com/"),
        },
    },
    {
        id: "notion", label: "Notion", initials: "N", category: "notes",
        aliases: [], terms: ["notes", "docs", "wiki", "pages"],
        routes: { web: web("https://www.notion.so/") },
    },
    {
        id: "outlook", label: "Outlook", initials: "O", category: "email",
        aliases: ["microsoft outlook", "hotmail"], terms: ["email", "inbox", "mail"],
        routes: { web: web("https://outlook.com/") },
    },
    {
        id: "spotify", label: "Spotify", initials: "S", category: "music",
        aliases: [], terms: ["songs", "playlist", "podcasts", "listen"],
        routes: { web: web("https://open.spotify.com/") },
    },
    {
        id: "youtube", label: "YouTube", initials: "YT", category: "video",
        aliases: ["you tube"], terms: ["videos", "watch", "tutorials"],
        routes: { web: web("https://www.youtube.com/") },
    },
];

const BY_ID = new Map<string, AppEntry>(APP_CATALOG.map((entry) => [entry.id, entry]));

/** The entry for a stored id, or undefined for an id this build doesn't know. */
export const appEntry = (id: string | null | undefined): AppEntry | undefined => (id ? BY_ID.get(id) : undefined);
