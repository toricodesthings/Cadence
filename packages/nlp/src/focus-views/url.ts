import { DEFAULT_DEFINITION, type FocusViewDefinition } from "./index.js";

const STATES = ["ACTIVE", "WAITING", "COMPLETE", "ARCHIVED"];
const WINDOWS = ["overdue", "today", "this_week", "this_month"] as const;
/** Every param a custom view can use; `sortMode` is not here, it lives in `?sort=`. */
export const DEFINITION_PARAMS = ["state", "list", "tags", "due", "pmin", "emin", "emax", "dmax", "waiting", "bare", "undated", "nolist"] as const;

const D = DEFAULT_DEFINITION;
const list = (v: string | undefined) => (v ? v.split(",").filter(Boolean) : []);
const num = (v: string | undefined, min: number, max: number) => {
  const n = Number(v);
  return v !== undefined && Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** A custom view as short readable params. Fields at their default are left out. */
export function definitionToParams(d: FocusViewDefinition): Record<string, string> {
  const out: Record<string, string> = {};
  if (d.states.join() !== D.states.join()) out.state = d.states.join(",").toLowerCase();
  if (d.projectIds.length) out.list = d.projectIds.join(",");
  if (d.tagIds.length) out.tags = d.tagIds.join(",");
  if (d.dueWindow) out.due = d.dueWindow;
  if (d.priorityMin !== null) out.pmin = String(d.priorityMin);
  if (d.effortMin !== null) out.emin = String(d.effortMin);
  if (d.effortMax !== null) out.emax = String(d.effortMax);
  if (d.durationMaxMinutes !== null) out.dmax = String(d.durationMaxMinutes);
  if (d.waitingOnly) out.waiting = "1";
  if (d.missingStructureOnly) out.bare = "1";
  if (d.needsDate) out.undated = "1";
  if (d.needsProject) out.nolist = "1";
  return out;
}

/** The view the params describe, or null when none of them is present. Bad values are skipped, never an error. */
export function definitionFromParams(p: URLSearchParams): FocusViewDefinition | null {
  if (!DEFINITION_PARAMS.some((k) => p.has(k))) return null;
  const get = (k: string) => p.get(k) ?? undefined;
  const states = list(get("state")).map((s) => s.toUpperCase()).filter((s) => STATES.includes(s));
  return {
    ...D,
    states: states.length ? states : D.states,
    projectIds: list(get("list")),
    tagIds: list(get("tags")),
    dueWindow: WINDOWS.find((w) => w === get("due")) ?? null,
    priorityMin: num(get("pmin"), 0, 4),
    effortMin: num(get("emin"), 1, 3),
    effortMax: num(get("emax"), 1, 3),
    durationMaxMinutes: num(get("dmax"), 1, 100000),
    waitingOnly: get("waiting") === "1",
    missingStructureOnly: get("bare") === "1",
    needsDate: get("undated") === "1",
    needsProject: get("nolist") === "1",
  };
}
