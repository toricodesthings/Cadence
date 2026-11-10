# Habits — Agent Instructions

Part of the backend: `apps/backend/AGENTS.md` §6 (envelope, idempotency) applies.

## Routes

- **habits** (`/habits`): CRUD; resolve (streak in the user's zone; skipped days are neutral, never a break). Steps: `stepStatus` sets the day via `stepDayStatus` (a partial day stays PENDING). Set times: one `time` + `at` per resolve, merged into `timeMarks` via `applyTimeMark` with the routine row locked; a whole-day done takes `likelyOpenTime` (nearest open within 90 min today, the only open one on another day) or is refused naming the open times; a whole-day skip is refused; `times` are sorted, one time becomes `targetTime`; steps and `times` are refused together; moving a time carries its marks on every day and re-derives today. `/weekly` range view: logs and tags pipelined on the RLS connection, then `projectHabitRange` expands the snapshot outside it; logs per due day from the day before creation (earlier only when logged); a pause hides today onward, never the past
