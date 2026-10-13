import type { LinkedAppId } from "@cadence/contracts/app-link";
import type { AppCategory } from "@cadence/nlp/app-suggestions";

/** Where one tap goes. `opens` is what the tap is allowed to claim: a custom scheme or a website. */
export interface AppRoute {
    href: string;
    opens: "app" | "website";
    /** True once the destination is proven: exercised on a device, documented by the vendor, or the app's long-standing scheme. */
    verified: boolean;
}

export interface AppEntry {
    id: LinkedAppId;
    label: string;
    /** Fixed, never derived from the label: the tile beside the full name. */
    initials: string;
    category: AppCategory;
    /** Other names someone types for it. Never a bare word ("mail", "notes") that a title uses for the act itself. */
    aliases: readonly string[];
    /** Words that describe what it is for, beyond its category. */
    terms: readonly string[];
    routes: {
        /** iPhone and iPad (installed app or browser tab): the app's own scheme, opening its home screen. */
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
    chat: { purpose: "Messages", heading: "messages" },
    meetings: { purpose: "Calls and meetings", heading: "calls" },
    health: { purpose: "Health", heading: "health" },
    automation: { purpose: "Shortcuts", heading: "shortcuts" },
};

const app = (href: string): AppRoute => ({ href, opens: "app", verified: true });
const web = (href: string): AppRoute => ({ href, opens: "website", verified: true });

/**
 * The supported destinations, not what is installed. iPhone schemes, by evidence:
 * - exercised on the owner's iPhone PWA: mfp
 * - vendor-documented: comgooglemaps (Google Maps URL scheme), spotify (Spotify iOS content linking),
 *   slack://open (Slack deep linking), zoomus (Zoom Meeting SDK), shortcuts (Apple Shortcuts guide),
 *   obsidian://open (Obsidian URI)
 * - long-standing and widely relied on: googlegmail, ms-outlook, googlecalendar, youtube, notion, whatsapp,
 *   msteams, and Apple's message, calshow, maps, music, mobilenotes, x-apple-health
 * A new candidate goes in with `verified: false` (shown only in dev and VITE_SHOW_UNVERIFIED_APPS builds)
 * until it is proven.
 */
export const APP_CATALOG: readonly AppEntry[] = [
    {
        id: "apple-calendar", label: "Apple Calendar", initials: "Cal", category: "calendar",
        aliases: ["ical", "ios calendar", "iphone calendar"], terms: ["agenda", "events"],
        routes: { ios: app("calshow://") },
    },
    {
        id: "apple-health", label: "Apple Health", initials: "Hth", category: "health",
        aliases: ["health app"], terms: ["medication", "meds", "sleep", "steps", "weight", "symptoms", "cycle"],
        routes: { ios: app("x-apple-health://") },
    },
    {
        id: "apple-mail", label: "Apple Mail", initials: "Mail", category: "email",
        aliases: ["ios mail", "iphone mail", "mail app"], terms: ["email", "inbox"],
        routes: { ios: app("message://") },
    },
    {
        id: "apple-maps", label: "Apple Maps", initials: "Map", category: "maps",
        aliases: ["ios maps", "iphone maps"], terms: ["directions", "navigate", "places"],
        routes: { ios: app("maps://"), web: web("https://maps.apple.com/") },
    },
    {
        id: "apple-music", label: "Apple Music", initials: "Mus", category: "music",
        aliases: ["itunes"], terms: ["songs", "playlist", "listen"],
        routes: { ios: app("music://"), web: web("https://music.apple.com/") },
    },
    {
        id: "apple-notes", label: "Apple Notes", initials: "Nts", category: "notes",
        aliases: ["ios notes", "iphone notes", "notes app"], terms: ["notes", "jot"],
        routes: { ios: app("mobilenotes://") },
    },
    {
        id: "google-calendar", label: "Google Calendar", initials: "GC", category: "calendar",
        aliases: ["gcal", "google cal"], terms: ["agenda", "events"],
        routes: { ios: app("googlecalendar://"), web: web("https://calendar.google.com/") },
    },
    {
        id: "google-maps", label: "Google Maps", initials: "GM", category: "maps",
        aliases: ["gmaps", "google map"], terms: ["directions", "navigate", "places"],
        routes: { ios: app("comgooglemaps://"), web: web("https://www.google.com/maps/@?api=1&map_action=map") },
    },
    {
        id: "gmail", label: "Gmail", initials: "G", category: "email",
        aliases: ["google mail", "g mail"], terms: ["email", "inbox", "mail"],
        routes: { ios: app("googlegmail://"), web: web("https://mail.google.com/") },
    },
    {
        id: "microsoft-teams", label: "Microsoft Teams", initials: "MT", category: "chat",
        aliases: ["ms teams", "msteams"], terms: ["chat", "meetings", "calls", "work"],
        routes: { ios: app("msteams://"), web: web("https://teams.microsoft.com/") },
    },
    {
        id: "myfitnesspal", label: "MyFitnessPal", initials: "MFP", category: "food",
        aliases: ["mfp", "my fitness pal"], terms: ["calories", "log food", "meals", "diet", "macros", "nutrition"],
        routes: { ios: app("mfp://"), web: web("https://www.myfitnesspal.com/") },
    },
    {
        id: "notion", label: "Notion", initials: "N", category: "notes",
        aliases: [], terms: ["notes", "docs", "wiki", "pages"],
        routes: { ios: app("notion://"), web: web("https://www.notion.so/") },
    },
    {
        id: "obsidian", label: "Obsidian", initials: "Ob", category: "notes",
        aliases: [], terms: ["notes", "vault", "markdown"],
        routes: { ios: app("obsidian://open") },
    },
    {
        id: "outlook", label: "Outlook", initials: "O", category: "email",
        aliases: ["microsoft outlook", "hotmail"], terms: ["email", "inbox", "mail"],
        routes: { ios: app("ms-outlook://"), web: web("https://outlook.com/") },
    },
    {
        id: "shortcuts", label: "Shortcuts", initials: "SC", category: "automation",
        aliases: ["apple shortcuts", "siri shortcuts"], terms: ["automation", "run"],
        routes: { ios: app("shortcuts://") },
    },
    {
        id: "slack", label: "Slack", initials: "Sl", category: "chat",
        aliases: [], terms: ["chat", "messages", "work", "dms"],
        routes: { ios: app("slack://open"), web: web("https://app.slack.com/client") },
    },
    {
        id: "spotify", label: "Spotify", initials: "S", category: "music",
        aliases: [], terms: ["songs", "playlist", "podcasts", "listen"],
        routes: { ios: app("spotify:"), web: web("https://open.spotify.com/") },
    },
    {
        id: "whatsapp", label: "WhatsApp", initials: "WA", category: "chat",
        aliases: ["whats app"], terms: ["chat", "messages", "texts"],
        routes: { ios: app("whatsapp://"), web: web("https://web.whatsapp.com/") },
    },
    {
        id: "youtube", label: "YouTube", initials: "YT", category: "video",
        aliases: ["you tube"], terms: ["videos", "watch", "tutorials"],
        routes: { ios: app("youtube://"), web: web("https://www.youtube.com/") },
    },
    {
        id: "zoom", label: "Zoom", initials: "Z", category: "meetings",
        aliases: [], terms: ["calls", "meetings", "video call"],
        routes: { ios: app("zoomus://"), web: web("https://app.zoom.us/wc") },
    },
];

const BY_ID = new Map<string, AppEntry>(APP_CATALOG.map((entry) => [entry.id, entry]));

/** The entry for a stored id, or undefined for an id this build doesn't know. */
export const appEntry = (id: string | null | undefined): AppEntry | undefined => (id ? BY_ID.get(id) : undefined);
