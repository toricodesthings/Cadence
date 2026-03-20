// @cadence/nlp — shared NLP package for Cadence task intelligence
// Pure TypeScript, no DOM assumptions, safe for web + Worker + mobile

export * from "./core/index.js";
export { parse, parseCanonicalNlpEnvelope, deriveOverallConfidence } from "./parse/index.js";
export { resolveProjectsAndTags } from "./resolve/index.js";
export { rankTasks } from "./ranking/index.js";
export type { RankableTask, RankedTask, TaskRankReason, RankingOptions } from "./ranking/index.js";
export {
  composeFocusView,
  applyFocusView,
  FOCUS_VIEW_PRESETS,
} from "./focus-views/index.js";
export type {
  FocusViewDefinition,
  FocusViewPreset,
  FocusViewComposerResult,
} from "./focus-views/index.js";
