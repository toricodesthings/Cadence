# Graph Report - Cadence  (2026-09-10)

## Corpus Check
- 901 files · ~876,977 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1004 nodes · 1176 edges · 67 communities (61 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `44814e94`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]

## God Nodes (most connected - your core abstractions)
1. `scripts` - 19 edges
2. `columns` - 16 edges
3. `scripts` - 15 edges
4. `scripts` - 13 edges
5. `exports` - 13 edges
6. `columns` - 13 edges
7. `overrides` - 12 edges
8. `columns` - 12 edges
9. `public.ai_conversations` - 11 edges
10. `public.ai_memories` - 11 edges

## Surprising Connections (you probably didn't know these)
- `generateConversationTitle()` --calls--> `deriveFallbackTitle()`  [INFERRED]
  apps/backend/src/domains/ai/title/generate-title.ts → packages/domain/src/ai-title.ts
- `generateConversationTitle()` --calls--> `normalizeTitle()`  [INFERRED]
  apps/backend/src/domains/ai/title/generate-title.ts → packages/domain/src/ai-title.ts
- `getAgentInstance()` --calls--> `getCompiledBlocks()`  [EXTRACTED]
  apps/backend/src/domains/ai/agent.ts → apps/backend/src/domains/ai/prompt/prompt-cache.ts
- `getAgentInstance()` --calls--> `composePrompt()`  [EXTRACTED]
  apps/backend/src/domains/ai/agent.ts → apps/backend/src/domains/ai/prompt/prompt-composer.ts
- `getAgentInstance()` --calls--> `selectToneBlock()`  [EXTRACTED]
  apps/backend/src/domains/ai/agent.ts → apps/backend/src/domains/ai/prompt/prompt-composer.ts

## Communities (67 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (24): aiMessageRoleEnum, aiMessageStatusEnum, aiPromptBlockKindEnum, aiPromptLayerEnum, aiPromptRevision, analysisStatusEnum, captureKindEnum, captureStatusEnum (+16 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (36): makeChatTransport(), checkMessageParts(), checkMessageText(), InputGuardResult, textLengthOfPart(), assessWindow(), describeUsage(), formatReset() (+28 more)

### Community 2 - "Community 2"
Cohesion: 0.33
Nodes (6): name, notNull, primaryKey, type, active_stream_id, columns

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (35): conversation_id, metadata, parts, role, status, user_id, name, notNull (+27 more)

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (31): AgentBuildOptions, compileDefaults(), getAgentInstance(), getModel(), getModelId(), loadUserContext(), maybeRetrieveMemories(), selectAuxiliary() (+23 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (30): aiRoutes, ChatMessage, createApp(), { getDbClientMock, withRlsMock, getRedisMock, getConversationMock, saveAssistantMessageMock }, post(), createApp(), { getDbClientMock, withRlsMock, getRedisMock, getConversationMock, attachToolOutputMock }, post() (+22 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (39): as, for, name, to, using, withCheck, columns, concurrently (+31 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (36): columns, concurrently, isUnique, method, name, with, columns, concurrently (+28 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (35): AiConversationRow, aiConversationRowSchema, AiMessageRow, aiMessageRowSchema, AiUsage, aiUsageSchema, AiUsageWindow, aiUsageWindowSchema (+27 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (17): columns, concurrently, isUnique, method, name, with, ai_prompt_blocks_active_kind_locale_unique, checkConstraints (+9 more)

### Community 10 - "Community 10"
Cohesion: 0.05
Nodes (37): as, for, name, to, using, withCheck, columnsFrom, columnsTo (+29 more)

### Community 11 - "Community 11"
Cohesion: 0.04
Nodes (47): columnsFrom, columnsTo, name, onDelete, onUpdate, tableFrom, tableTo, columns (+39 more)

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (23): dependencies, @cadence/contracts, @cadence/nlp, date-fns, rrule, devDependencies, typescript, vitest (+15 more)

### Community 13 - "Community 13"
Cohesion: 0.17
Nodes (12): clamp(), deriveFallbackTitle(), normalizeTitle(), upperFirst(), generateConversationTitle(), getTitleModelId(), cache, ensureTitlePromptSeeded() (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.03
Nodes (69): dependencies, ai, @ai-sdk/react, @cadence/contracts, @cadence/domain, @cadence/nlp, clsx, date-fns (+61 more)

### Community 15 - "Community 15"
Cohesion: 0.22
Nodes (9): template, columns, name, schema, public.ai_title_prompts, name, notNull, primaryKey (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.29
Nodes (7): type, default, name, notNull, primaryKey, type, typeSchema

### Community 17 - "Community 17"
Cohesion: 0.29
Nodes (7): revision, columns, default, name, notNull, primaryKey, type

### Community 18 - "Community 18"
Cohesion: 0.33
Nodes (6): default, name, notNull, primaryKey, type, access_count

### Community 19 - "Community 19"
Cohesion: 0.33
Nodes (6): salience, default, name, notNull, primaryKey, type

### Community 20 - "Community 20"
Cohesion: 0.33
Nodes (6): expires_at, name, notNull, primaryKey, type, columns

### Community 21 - "Community 21"
Cohesion: 0.33
Nodes (6): id, default, name, notNull, primaryKey, type

### Community 22 - "Community 22"
Cohesion: 0.33
Nodes (6): is_active, default, name, notNull, primaryKey, type

### Community 23 - "Community 23"
Cohesion: 0.33
Nodes (6): kind, name, notNull, primaryKey, type, typeSchema

### Community 24 - "Community 24"
Cohesion: 0.33
Nodes (6): layer, name, notNull, primaryKey, type, typeSchema

### Community 25 - "Community 25"
Cohesion: 0.33
Nodes (6): locale, default, name, notNull, primaryKey, type

### Community 26 - "Community 26"
Cohesion: 0.33
Nodes (6): notes, name, notNull, primaryKey, type, columns

### Community 27 - "Community 27"
Cohesion: 0.33
Nodes (6): updated_at, default, name, notNull, primaryKey, type

### Community 28 - "Community 28"
Cohesion: 0.33
Nodes (6): version, default, name, notNull, primaryKey, type

### Community 29 - "Community 29"
Cohesion: 0.40
Nodes (5): content, name, notNull, primaryKey, type

### Community 30 - "Community 30"
Cohesion: 0.40
Nodes (5): dedupe_hash, name, notNull, primaryKey, type

### Community 31 - "Community 31"
Cohesion: 0.40
Nodes (5): embedding, name, notNull, primaryKey, type

### Community 32 - "Community 32"
Cohesion: 0.40
Nodes (5): source_conversation_id, name, notNull, primaryKey, type

### Community 33 - "Community 33"
Cohesion: 0.40
Nodes (5): source_message_id, name, notNull, primaryKey, type

### Community 34 - "Community 34"
Cohesion: 0.40
Nodes (5): embedding_model, name, notNull, primaryKey, type

### Community 35 - "Community 35"
Cohesion: 0.40
Nodes (5): last_accessed_at, name, notNull, primaryKey, type

### Community 36 - "Community 36"
Cohesion: 0.50
Nodes (3): dialect, entries, version

### Community 44 - "Community 44"
Cohesion: 0.04
Nodes (46): dependencies, ai, @ai-sdk/openai, @cadence/contracts, @cadence/domain, @cadence/nlp, date-fns, drizzle-orm (+38 more)

### Community 45 - "Community 45"
Cohesion: 0.04
Nodes (44): pg, react, devDependencies, turbo, engines, node, name, effect (+36 more)

### Community 46 - "Community 46"
Cohesion: 0.06
Nodes (33): devDependencies, @cadence/backend, @cloudflare/workers-types, jsdom, @react-router/dev, tailwindcss, @tailwindcss/typography, @tailwindcss/vite (+25 more)

### Community 47 - "Community 47"
Cohesion: 0.07
Nodes (28): dependencies, @cadence/nlp, zod, devDependencies, typescript, vitest, exports, ./ai (+20 more)

### Community 48 - "Community 48"
Cohesion: 0.07
Nodes (29): dependencies, expo, expo-constants, expo-font, expo-haptics, expo-image, expo-linking, expo-router (+21 more)

### Community 49 - "Community 49"
Cohesion: 0.22
Nodes (9): scripts, android, dev, ios, lint, reset-project, start, typecheck (+1 more)

### Community 50 - "Community 50"
Cohesion: 0.29
Nodes (7): devDependencies, @cadence/backend, @cloudflare/workers-types, eslint, eslint-config-expo, @types/react, typescript

### Community 51 - "Community 51"
Cohesion: 0.33
Nodes (6): created_at, default, name, notNull, primaryKey, type

### Community 52 - "Community 52"
Cohesion: 0.40
Nodes (4): main, name, private, version

### Community 53 - "Community 53"
Cohesion: 0.40
Nodes (5): order_index, name, notNull, primaryKey, type

### Community 55 - "Community 55"
Cohesion: 0.08
Nodes (25): dependencies, chrono-node, fuse.js, rrule, devDependencies, date-fns, typescript, vitest (+17 more)

### Community 56 - "Community 56"
Cohesion: 0.08
Nodes (21): aiConversations, aiMemories, aiMessages, aiPromptBlocks, aiTitlePrompts, habitLogs, habits, habitTags (+13 more)

### Community 57 - "Community 57"
Cohesion: 0.11
Nodes (17): devDependencies, chai, mocha, selenium-webdriver, @tauri-apps/cli, name, private, scripts (+9 more)

### Community 58 - "Community 58"
Cohesion: 0.20
Nodes (10): checkConstraints, compositePrimaryKeys, foreignKeys, indexes, isRLSEnabled, name, policies, schema (+2 more)

### Community 59 - "Community 59"
Cohesion: 0.29
Nodes (5): subtasks, tags, tasks, taskTags, minimalTaskColumns

### Community 60 - "Community 60"
Cohesion: 0.33
Nodes (5): promptBlockKindSchema, PromptBlockUpsert, promptBlockUpsertSchema, TitlePromptUpsert, titlePromptUpsertSchema

### Community 61 - "Community 61"
Cohesion: 0.33
Nodes (6): default, name, notNull, primaryKey, type, archived

### Community 62 - "Community 62"
Cohesion: 0.40
Nodes (5): last_message_at, name, notNull, primaryKey, type

### Community 63 - "Community 63"
Cohesion: 0.40
Nodes (5): last_stream_id, name, notNull, primaryKey, type

### Community 64 - "Community 64"
Cohesion: 0.40
Nodes (5): last_stream_status, name, notNull, primaryKey, type

### Community 65 - "Community 65"
Cohesion: 0.40
Nodes (5): model, name, notNull, primaryKey, type

### Community 66 - "Community 66"
Cohesion: 0.40
Nodes (5): title, name, notNull, primaryKey, type

## Knowledge Gaps
- **710 isolated node(s):** `name`, `private`, `type`, `./types/*`, `dev` (+705 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `columns` connect `Community 20` to `Community 32`, `Community 33`, `Community 34`, `Community 35`, `Community 3`, `Community 10`, `Community 16`, `Community 18`, `Community 51`, `Community 19`, `Community 21`, `Community 27`, `Community 29`, `Community 30`, `Community 31`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `tables` connect `Community 10` to `Community 6`, `Community 9`, `Community 11`, `Community 15`, `Community 58`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `public.ai_memories` connect `Community 10` to `Community 20`, `Community 7`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _710 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05701754385964912 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._