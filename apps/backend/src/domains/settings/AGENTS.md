# Settings — Agent Instructions

Part of the backend: `apps/backend/AGENTS.md` §6 applies.

## Routes

- **settings** (`/settings`, `/settings/background`): GET + PATCH (deep-merge via `deepPartial`); background = one photo per user in R2 (`USER_ASSETS`): POST upload (WebP-only, metadata stripped), GET own image, DELETE

**Settings:** the contract's `userSettingsSchema` types the `users.settings` column; reads return `normalizeSettings` → `SettingsView` (stored over defaults). `settings.appearance.backgroundImage` is server-owned: `sanitizeBackgroundPatch` (`domains/settings/background-image.ts`) lets a PATCH change only accent/blur/brightness, never the photo's identity or existence. Notification fields (`browser`, `taskReminders`, `habitReminders`, `dueDateAlerts`) are required. `settings.assistant`: `persona` is the one voice setting (it picks `prompts/assistant/voice/<persona>.md`); `tone` and `verbosity` stay for back-compat but never reach the prompt; the rest (names, emoji, proactiveSuggestions, adaptiveTone) render into the prompt's Environment. Free-text fields (names, customInstructions) are sanitized and fenced (see `../ai/AGENTS.md`); never trust them raw in a prompt.
