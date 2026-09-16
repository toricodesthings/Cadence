/** Canonical URLs. The landing site links into the app; it never calls the API. */
export const SITE_URL = "https://cadenceapp.cloud";
export const APP_URL = "https://dashboard.cadenceapp.cloud";
export const SIGN_IN_URL = `${APP_URL}/auth/sign-in`;
export const SIGN_UP_URL = `${APP_URL}/auth/sign-up`;
export const PRIVACY_URL = `${APP_URL}/privacy-policy`;
export const TERMS_URL = `${APP_URL}/terms`;
export const CHANGELOG_URL = `${APP_URL}/changelog`;
export const REPO_URL = "https://github.com/toricodesthings/Cadence";
export const ISSUES_URL = `${REPO_URL}/issues`;

export const SITE_NAME = "Cadence";
export const SITE_TAGLINE = "Built for the real you, not the perfect one.";
/** The hero's one line under the tagline: the feeling of Cadence, not a feature list. */
export const HERO_SENTENCE =
  "Plans that bend with you, through the bright days and the quiet ones.";
export const SITE_DESCRIPTION =
  "Cadence is a calm, atmospheric planning workspace for tasks, habits, and weekly resets. It adapts to you and never punishes you for being inconsistent.";

/*
 * The journey under the hero: one year on one bough. Every line must be true of the app today; a feature's
 * name appears once, in its eyebrow.
 */
export type Season = "spring" | "summer" | "autumn" | "winter";

export const PRELUDE = {
  lead: "Most planners are made for someone who never has a bad week.",
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
    eyebrow: "I · Inbox & Quick Add",
    title: "Set it down. Sort it later.",
    body: "Thoughts arrive at the worst moments. Catch one in a line, in your own words, and Cadence finds the date, the time and the tag inside it.",
    glints: ["Press Q from anywhere", "Plain words become plans", "Nothing asks you to decide yet"],
  },
  plan: {
    id: "plan",
    season: "summer",
    panel: "left",
    eyebrow: "II · Planner & Projects",
    title: "As deep as the day allows.",
    body: "Lists or boards, projects and sections, subtasks and notes. A task can hold everything, and it is still a task when it holds only a name.",
    glints: ["Holding, for what belongs nowhere yet", "Drag to reorder, defer, plan", "Nothing is gone for good"],
  },
  time: {
    id: "time",
    season: "autumn",
    panel: "right",
    eyebrow: "III · Schedule",
    title: "Time, seen whole.",
    body: "Tasks, habits and events share one calendar, from a single day to the whole year. When something slips, it moves to tomorrow in one gesture, and nothing turns red.",
    glints: ["Due is not the same as scheduled", "Day, week, month, year", "Holidays and weather, if you want them"],
  },
  rhythm: {
    id: "rhythm",
    season: "winter",
    panel: "left",
    eyebrow: "IV · Habits & Weekly Reset",
    title: "Rest is part of the rhythm.",
    body: "Mark a habit done, skip it on purpose, or pause it while life is loud. The month still shows the shape of it, and a missed day is left as a quiet mark, never a reproach.",
    glints: ["Skip a day, on purpose", "Pause a habit, don't lose it", "A weekly reset, when you're ready"],
  },
} satisfies Record<string, ChapterCopy>;

/** The keystone, between autumn and winter. She wears no season: her light is the lantern's. */
export const EMILIE = {
  eyebrow: "Emilie · Your planning companion",
  title: "Say it as it comes.",
  body: "Tell Emilie what's on your mind, however tangled. She reads your real tasks, habits and calendar, drafts every change to your plans, and waits for your yes. She never adds an obligation you didn't ask for.",
  glints: ["She drafts, you decide", "Remembers only if you let her", "Gentler when the week is heavy"],
};

export const CONSTELLATION = {
  eyebrow: "Constellation",
  title: "And the small things, done with care.",
  stars: [
    { name: "Search", gloss: "⌘K finds anything" },
    { name: "Quick Add", gloss: "Q, from anywhere" },
    { name: "Holding", gloss: "For the unplaced" },
    { name: "Today", gloss: "Only what matters now" },
    { name: "Undo", gloss: "It waits in the corner" },
    { name: "Reminders", gloss: "Quiet hours, kept" },
    { name: "Palettes", gloss: "Eight, and daylight" },
    { name: "Seasons", gloss: "The year, in the app too" },
    { name: "Desktop", gloss: "Cadence, as an app" },
  ],
};

export const FINALE = {
  title: "And then, it's spring again.",
  body: "Leave for a week or a season. When you come back, Cadence won't ask where you've been.",
  /** The one invitation at the end; deliberately not the hero's words, and short enough to sit in the seal. */
  invite: "Start now",
  /** Under the seal: the smallest first step, so the press costs nothing. */
  nudge: "One line is a beginning.",
};

/** The 404, framed by the hero's portrait boughs. */
export const NOT_FOUND = {
  title: "Page not found",
  line: "There's nothing at this address. The bough doesn't reach this far.",
  back: "Back to the beginning",
};

/** The ground: the name, one line of its own, and the link groups. Nothing here repeats the vows. */
export const FOOTER = {
  line: "Built with care for the beautifully inconsistent.",
  sign: "The lamps stay on. Come back whenever.",
  top: "Back to the top",
};

export const VOWS: readonly { title: string; line: string; href?: string }[] = [
  { title: "Always free", line: "No pro tier, no limits." },
  { title: "Open source", line: "Read every line.", href: REPO_URL },
  { title: "Yours alone", line: "No telemetry without your say, and nothing trains on it." },
];
