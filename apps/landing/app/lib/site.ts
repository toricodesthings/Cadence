/** Canonical URLs. The landing site links into the app; it never calls the API. */
export const SITE_URL = "https://cadenceapp.cloud";
export const APP_URL = "https://dashboard.cadenceapp.cloud";
export const SIGN_IN_URL = `${APP_URL}/auth/sign-in`;
export const SIGN_UP_URL = `${APP_URL}/auth/sign-up`;
/** The legal pages live on this site; the app and its About tab link here. */
export const PRIVACY_PATH = "/privacy";
export const TERMS_PATH = "/terms";

/** Chromium fetches a landing page's document ahead when its link is hovered or touched. Prefetch only: a prerender would run the hero intro unseen. */
export const SPECULATION_RULES = JSON.stringify({
  prefetch: [{ where: { href_matches: ["/", TERMS_PATH, PRIVACY_PATH] }, eagerness: "moderate" }],
});
export const CHANGELOG_URL = `${APP_URL}/changelog`;
export const REPO_URL = "https://github.com/toricodesthings/Cadence";
export const ISSUES_URL = `${REPO_URL}/issues`;

export const SITE_NAME = "Cadence";
export const SITE_TAGLINE = "A planner for the life you have.";
/** The hero's poetic promise, beneath the line that names the product. */
export const HERO_SENTENCE =
  "Plans that bend with you, through the bright days and the quiet ones.";
export const SITE_DESCRIPTION =
  "Make room for real life with Cadence: a free planner for tasks, routines and your calendar, with an AI companion to help turn loose thoughts into next steps.";
export const SIGN_UP_LABEL = "Start free";

/*
 * The journey under the hero: one year on one bough. Every line must be true of the app today; a feature's
 * name appears once, in its eyebrow.
 */
export type Season = "spring" | "summer" | "autumn" | "winter";

export const PRELUDE = {
  lead: "Some days you plan a whole new chapter. Some days you turn one page.",
  /** Read as one sentence: line, then the emphasised year (painted in the four seasons), then a full stop. */
  line: "Cadence is made for the",
  year: "whole year",
};

export type ChapterCopy = {
  id: string;
  /** The season it wears, and the palette with it; none wears the lantern's light. */
  season?: Season;
  /** The side the panel takes on wide screens; the words take the other. */
  panel: "left" | "right";
  eyebrow: string;
  title: string;
  body: string;
  glints: readonly string[];
};

export const CHAPTERS = {
  capture: {
    id: "capture",
    season: "spring",
    panel: "right",
    eyebrow: "I · Capture",
    title: "Set it down. Sort it later.",
    body: "A thought doesn't have to be a task yet. Set it down with no list, no date, no decision. When you're ready, Cadence suggests where it might belong.",
    glints: ["Tick off a thought without making a task", "Drag a thought straight onto a day", "Sort them all in one tap, with one Undo"],
  },
  plan: {
    id: "plan",
    season: "summer",
    panel: "left",
    eyebrow: "II · Every kind of plan",
    title: "Big plans. Small beginnings.",
    body: "Plan in rows, on a board, or not at all. A task holds only what you give it, and when it's due stays apart from the day you'll do it.",
    glints: ["Waiting on someone? Set a check-in day", "Hide a task until the day it matters", "Open the app a task needs in one tap"],
  },
  time: {
    id: "time",
    season: "autumn",
    panel: "right",
    eyebrow: "III · Schedule",
    title: "See where the day has room.",
    body: "Day, week, month and year, with tasks, routines, events and holidays together. Drag a task into an open hour. When life shifts, the plan moves with it.",
    glints: ["Class timetables that run all term", "Rent carries over. Class just passes.", "Keep a date without choosing an hour"],
  },
  rhythm: {
    id: "rhythm",
    season: "winter",
    panel: "left",
    eyebrow: "IV · Routines & Weekly Reset",
    title: "A rhythm you can return to.",
    body: "Skip a day, pause for a fortnight, or check in three times a day. Once a week, a two-minute Reset gathers what's loose and lays out the week ahead.",
    glints: ["A skipped day is just a skipped day", "Little steps inside each routine", "Loose ends get one-tap next steps"],
  },
  /** The long night before spring: no season, only the lantern's light. */
  today: {
    id: "today",
    panel: "right",
    eyebrow: "V · Today",
    title: "Lost\u00a0a\u00a0week? Start from today.",
    body: "Missed classes and skipped routines just pass. Unfinished tasks wait quietly under Still open, and Cadence can fit today's into the gaps between your plans.",
    glints: ["Swipe a task to your next free gap", "Slipping tasks offer smaller steps", "Waiting tasks can wait a little longer"],
  },
} satisfies Record<string, ChapterCopy>;

/** The keystone, between autumn and winter. She wears no season: her light is the lantern's. */
export const EMILIE = {
  eyebrow: "Emilie · Your AI planning companion",
  title: "Say it as it comes.",
  body: "Tell Emilie what's on your mind, or show her a photo of the syllabus. She works across all of Cadence, remembers what matters to you, and offers a best guess on the small calls. You choose what she may change.",
  glints: ["Memory you can read and erase", "Learns how long things take you", "Connect Claude and other AI apps"],
};

export const CONSTELLATION = {
  eyebrow: "Constellations",
  title: "A whole world in the details.",
  stars: [
    { name: "Focus views", gloss: "Your own saved filters" },
    { name: "Reminders", gloss: "A nudge. Then quiet." },
    { name: "Search", gloss: "Finds it, typos and all" },
    { name: "Task notes", gloss: "Space for the whole idea" },
    { name: "Events", gloss: "Yearly dates, counted down" },
    { name: "Offline edits", gloss: "Edit now. Sync later." },
    { name: "Undo", gloss: "Take back almost anything" },
    { name: "Appearance", gloss: "Undeniably yours to customize" },
    { name: "Desktop", gloss: "A home beyond the browser" },
  ],
};

export const FINALE = {
  title: "And then, it's spring again.",
  body: "Start with one thought. Let the rest take shape.",
  /** The same clear invitation as the hero. */
  invite: SIGN_UP_LABEL,
  /** The one practical reassurance beside the signup action. */
  reassurance: "Free to use. No subscription.",
};

/** The 404, framed by the hero's portrait boughs. */
export const NOT_FOUND = {
  title: "Page not found",
  line: "There's nothing at this address. The bough doesn't reach this far.",
  back: "Back to the beginning",
};

/** The ground: the name, a sign-off, and links to the app, source and policies. */
export const FOOTER = {
  line: "Built with care for the beautifully inconsistent.",
  sign: "The lamps stay on. Come back whenever.",
  top: "Back to the top",
};
