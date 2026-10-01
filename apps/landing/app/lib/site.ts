/** Canonical URLs. The landing site links into the app; it never calls the API. */
export const SITE_URL = "https://cadenceapp.cloud";
export const APP_URL = "https://dashboard.cadenceapp.cloud";
export const SIGN_IN_URL = `${APP_URL}/auth/sign-in`;
export const SIGN_UP_URL = `${APP_URL}/auth/sign-up`;
/** The legal pages live on this site; the app and its About tab link here. */
export const PRIVACY_PATH = "/privacy";
export const TERMS_PATH = "/terms";
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
  /** The season it wears, and the palette with it. */
  season: Season;
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
    eyebrow: "I · Capture & Quick Add",
    title: "Set it down. Sort it later.",
    body: "Catch an errand, an idea, or a whole handful of thoughts. Give one a day when you're ready, or keep it as a note.",
    glints: ["Paste a list into separate thoughts", "Dates and times from your words", "Press T for Quick Add"],
  },
  plan: {
    id: "plan",
    season: "summer",
    panel: "left",
    eyebrow: "II · Lists & Boards",
    title: "Big plans. Small beginnings.",
    body: "Give a project its own list, a little structure, and a first step. Switch from rows to a board as the picture grows.",
    glints: ["Sections become board columns", "Subtasks make the next step clear", "Waiting, with a check-in date"],
  },
  time: {
    id: "time",
    season: "autumn",
    panel: "right",
    eyebrow: "III · Schedule",
    title: "See where the day has room.",
    body: "See tasks, routines and events together. Drag a task into an open hour, with its deadline kept separate. When life shifts, move the plan with it.",
    glints: ["Zoom from a day to the year", "Repeating blocks for classes and shifts", "Keep a date without choosing an hour"],
  },
  rhythm: {
    id: "rhythm",
    season: "winter",
    panel: "left",
    eyebrow: "IV · Routines",
    title: "A rhythm you can return to.",
    body: "Build a morning ritual one small step at a time. Check in, skip a day, or pause for a while. Your history stays, and the next day starts fresh.",
    glints: ["Little checklists inside each routine", "See your pattern across the month", "Show streaks only if they help"],
  },
} satisfies Record<string, ChapterCopy>;

/** The keystone, between autumn and winter. She wears no season: her light is the lantern's. */
export const EMILIE = {
  eyebrow: "Emilie · Your AI planning companion",
  title: "Say it as it comes.",
  body: "Tell Emilie what's on your mind, however tangled. With your tasks and calendar in view, she can break a project into steps, sort your lists, or help lighten a crowded week.",
  glints: ["Turn a photo into task drafts", "Review changes in Ask first mode", "Memory you control"],
};

export const CONSTELLATION = {
  eyebrow: "Constellations",
  title: "A whole world in the details.",
  stars: [
    { name: "Today", gloss: "The day in one place" },
    { name: "Focus views", gloss: "Your own saved filters" },
    { name: "Task notes", gloss: "Space for the whole idea" },
    { name: "Weekly Reset", gloss: "Give loose ends a next step" },
    { name: "Reminders", gloss: "A nudge. Then quiet." },
    { name: "Appearance", gloss: "Your own backdrop" },
    { name: "Offline edits", gloss: "Edit now. Sync later." },
    { name: "Desktop", gloss: "A home beyond the browser" },
    { name: "Connected AI", gloss: "Your other AI, connected" },
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
