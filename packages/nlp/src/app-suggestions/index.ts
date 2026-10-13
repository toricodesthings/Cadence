// Which supported apps a task or routine title points at. Deterministic phrase rules, no parser, no I/O:
// an action next to an object ("check email", "log calories"), or an app's own name. It only ever orders a
// picker; nothing here selects an app.

export type AppCategory = "email" | "food" | "calendar" | "maps" | "music" | "notes" | "video";

/** An app as the caller offers it: `names` holds its name and aliases. */
export interface AppDescriptor {
    id: string;
    category: AppCategory;
    names: readonly string[];
}

export interface AppSuggestion {
    /** Supplied ids, in the order supplied. */
    ids: string[];
    /** `named`: the title says the app; `category`: the title describes what it does. */
    basis: "named" | "category";
    category?: AppCategory;
}

const RULES: Record<AppCategory, { actions: string; objects: string }> = {
    email: { actions: "check|read|answer|reply to|clear|triage|go through|open|catch up on|sort", objects: "e-?mails?|inbox|inboxes" },
    food: { actions: "log|track|record|count|enter|add", objects: "calories|calorie|meals?|food|macros|breakfast|lunch|dinner|snacks?" },
    calendar: { actions: "check|review|look at|update|plan|open|go through|look over", objects: "calendar|calendars" },
    maps: { actions: "check|find|look up|open|plan|get", objects: "maps?|directions|route" },
    music: { actions: "listen to|play|put on|queue", objects: "music|playlists?|songs?|albums?" },
    notes: { actions: "write|take|update|review|organi[sz]e|jot", objects: "notes|notebook" },
    video: { actions: "watch|catch up on", objects: "videos?|tutorials?|lectures?" },
};

// "Don't check email", "never", "stop": the person is steering away from it. Research wording names the topic, not the act.
const ABSTAIN = /\b(don'?t|do not|never|stop|avoid|without|instead of|no more|skip|research|compare|comparison|alternatives?|versus|vs)\b/i;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (pattern: string) => new RegExp(`(?:^|[^a-z0-9])(?:${pattern})(?![a-z0-9])`, "i");

const CATEGORY_PATTERNS = Object.entries(RULES).map(([category, { actions, objects }]) => ({
    category: category as AppCategory,
    // The action, then at most three filler words, then the object: "check my work inbox".
    pattern: new RegExp(`(?:^|[^a-z0-9])(?:${actions})(?:\\s+[a-z0-9'’-]+){0,3}?\\s+(?:${objects})(?![a-z0-9])`, "i"),
}));

export function suggestApps(title: string, apps: readonly AppDescriptor[]): AppSuggestion | null {
    const text = title.normalize("NFKC").trim();
    if (!text || !apps.length || ABSTAIN.test(text)) return null;

    const named = apps.filter((app) => app.names.some((name) => name.trim() && word(escape(name.trim())).test(text)));
    const namedCategories = new Set(named.map((app) => app.category));
    if (named.length && namedCategories.size === 1) return { ids: named.map((app) => app.id), basis: "named", category: named[0].category };
    if (namedCategories.size > 1) return null;

    const categories = CATEGORY_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ category }) => category);
    if (categories.length !== 1) return null;
    const ids = apps.filter((app) => app.category === categories[0]).map((app) => app.id);
    return ids.length ? { ids: ids.slice(0, 3), basis: "category", category: categories[0] } : null;
}
