/**
 * Focus Views — natural-language view phrases → structured definitions (Section 12).
 *
 * Three layers:
 * 1. Presets — built-in named views
 * 2. Natural-language composer — phrase → chips
 * 3. Saved/pinned views — persisted user views
 */

import Fuse from "fuse.js";

// ── View definition schema (Section 12.3) ──

export interface FocusViewDefinition {
  states: string[];
  projectIds: string[];
  tagIds: string[];
  needsDate: boolean;
  needsProject: boolean;
  priorityMin: number | null;
  effortMax: number | null;
  dueWindow: "overdue" | "today" | "this_week" | "this_month" | null;
  waitingOnly: boolean;
  missingStructureOnly: boolean;
  sortMode: "smart" | "priority" | "manual";
}

export interface FocusViewPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  definition: FocusViewDefinition;
}

// ── Default definition ──

const DEFAULT_DEFINITION: FocusViewDefinition = {
  states: ["ACTIVE"],
  projectIds: [],
  tagIds: [],
  needsDate: false,
  needsProject: false,
  priorityMin: null,
  effortMax: null,
  dueWindow: null,
  waitingOnly: false,
  missingStructureOnly: false,
  sortMode: "smart",
};

// ── Built-in presets (Section 12.2, Layer 1) ──

export const FOCUS_VIEW_PRESETS: FocusViewPreset[] = [
  {
    id: "quick-wins",
    name: "Quick Wins",
    description: "Short tasks you can knock out fast",
    icon: "Zap",
    definition: {
      ...DEFAULT_DEFINITION,
      effortMax: 1,
      sortMode: "smart",
    },
  },
  {
    id: "due-soon",
    name: "Due Soon",
    description: "Tasks due today or overdue",
    icon: "Clock",
    definition: {
      ...DEFAULT_DEFINITION,
      dueWindow: "today",
      sortMode: "priority",
    },
  },
  {
    id: "needs-dates",
    name: "Needs Dates",
    description: "Tasks with no date set",
    icon: "CalendarX",
    definition: {
      ...DEFAULT_DEFINITION,
      needsDate: true,
    },
  },
  {
    id: "waiting",
    name: "Waiting",
    description: "Tasks waiting on someone else",
    icon: "UserCheck",
    definition: {
      ...DEFAULT_DEFINITION,
      waitingOnly: true,
      states: ["WAITING"],
    },
  },
  {
    id: "deep-focus",
    name: "Deep Focus",
    description: "High-effort tasks that need concentration",
    icon: "Brain",
    definition: {
      ...DEFAULT_DEFINITION,
      priorityMin: 3,
      sortMode: "priority",
    },
  },
  {
    id: "clear-the-fog",
    name: "Clear the Fog",
    description: "Tasks missing dates, projects, or structure",
    icon: "CloudFog",
    definition: {
      ...DEFAULT_DEFINITION,
      missingStructureOnly: true,
    },
  },
];

// ── Natural-language → definition composer (Layer 2) ──

interface PhraseRule {
  pattern: RegExp;
  apply: (def: FocusViewDefinition, match: RegExpMatchArray) => void;
}

const PHRASE_RULES: PhraseRule[] = [
  {
    pattern: /\boverdue\b/i,
    apply: (def) => { def.dueWindow = "overdue"; },
  },
  {
    pattern: /\bdue\s+today\b/i,
    apply: (def) => { def.dueWindow = "today"; },
  },
  {
    pattern: /\bdue\s+this\s+week\b/i,
    apply: (def) => { def.dueWindow = "this_week"; },
  },
  {
    pattern: /\bno\s+(?:date|dates)\b/i,
    apply: (def) => { def.needsDate = true; },
  },
  {
    pattern: /\bno\s+project\b/i,
    apply: (def) => { def.needsProject = true; },
  },
  {
    pattern: /\bwaiting\b/i,
    apply: (def) => { def.waitingOnly = true; def.states = ["WAITING"]; },
  },
  {
    pattern: /\bquick\b|\bshort\b|\bfast\b/i,
    apply: (def) => { def.effortMax = 1; },
  },
  {
    pattern: /\bhigh\s*prio(?:rity)?\b/i,
    apply: (def) => { def.priorityMin = 3; },
  },
  {
    pattern: /\burgent\b/i,
    apply: (def) => { def.priorityMin = 4; },
  },
  {
    pattern: /\bmissing\s+(?:structure|info)\b/i,
    apply: (def) => { def.missingStructureOnly = true; },
  },
];

export interface FocusViewComposerResult {
  definition: FocusViewDefinition;
  matchedRules: string[];
  /** Whether the phrase matched any known preset */
  matchedPreset: FocusViewPreset | null;
}

/**
 * Convert a natural-language phrase into a structured Focus View definition.
 */
export function composeFocusView(
  phrase: string,
  context?: { projects: Array<{ id: string; name: string }> },
): FocusViewComposerResult {
  // First, check if the phrase matches a preset name
  const presetFuse = new Fuse(FOCUS_VIEW_PRESETS, {
    includeScore: true,
    threshold: 0.3,
    keys: ["name", "description"],
  });
  const presetResults = presetFuse.search(phrase);
  if (presetResults.length > 0 && presetResults[0].score !== undefined && presetResults[0].score < 0.15) {
    return {
      definition: { ...presetResults[0].item.definition },
      matchedRules: [`Matched preset: ${presetResults[0].item.name}`],
      matchedPreset: presetResults[0].item,
    };
  }

  // Apply phrase rules
  const definition = { ...DEFAULT_DEFINITION };
  const matchedRules: string[] = [];

  for (const rule of PHRASE_RULES) {
    const match = phrase.match(rule.pattern);
    if (match) {
      rule.apply(definition, match);
      matchedRules.push(match[0]);
    }
  }

  // Try to resolve project names from the phrase
  if (context?.projects && context.projects.length > 0) {
    const projectFuse = new Fuse(context.projects, {
      includeScore: true,
      threshold: 0.3,
      keys: ["name"],
    });

    // Extract potential project references
    const projectMatch = phrase.match(/\b(?:in|for|from)\s+(\w[\w\s]*)/i);
    if (projectMatch) {
      const results = projectFuse.search(projectMatch[1].trim());
      if (results.length > 0 && results[0].score !== undefined && results[0].score < 0.2) {
        definition.projectIds = [results[0].item.id];
        matchedRules.push(`Project: ${results[0].item.name}`);
      }
    }
  }

  return {
    definition,
    matchedRules,
    matchedPreset: null,
  };
}

// Re-export from the lightweight apply module (no Fuse.js dependency)
export { applyFocusView } from "./apply.js";
