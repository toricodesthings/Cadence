import { expectTypeOf, test } from "vitest";
import type { ConversationDetail, ConversationListItem } from "@cadence/contracts/ai";
import type { Habit } from "@cadence/contracts/habit";
import type { InboxItem } from "@cadence/contracts/inbox";
import type { NotificationState } from "@cadence/contracts/notification";
import type { Project } from "@cadence/contracts/project";
import type { ApproximatePlace, CityResult, HolidayRecord, RegionInfo, WeatherReading } from "@cadence/contracts/proxy";
import type { TaskSection } from "@cadence/contracts/section";
import type { SavedFocusView, SettingsView } from "@cadence/contracts/settings";
import type { Subtask } from "@cadence/contracts/subtask";
import type { Tag } from "@cadence/contracts/tag";
import type { Task } from "@cadence/contracts/task";
import type { ApiClient } from "../../../../app/lib/api/client";
import type { ResponseData } from "../../../../app/lib/api/helpers";

// Compile-time guardrails, enforced by `tsc --noEmit`: what each read route sends
// (inferred through the RPC client) must equal its contract entity. The backend's
// Row-parity test covers DB ↔ contract; this covers route ↔ contract. Entities that
// are deliberately looser than the route (optional fields for optimistic caches,
// packages/AGENTS.md §1.4) are checked with `toExtend`: the route's output fits.

type Data<F> = F extends (...args: never[]) => Promise<infer R> ? ResponseData<R> : never;
type Api = ApiClient["api"];

test("every read route returns its contract entity", () => {
    expectTypeOf<Data<Api["tasks"]["$get"]>>().toEqualTypeOf<Task[]>();
    expectTypeOf<Data<Api["tasks"][":id"]["$get"]>>().toEqualTypeOf<Task>();
    expectTypeOf<Data<Api["tasks"][":id"]["$delete"]>>().toEqualTypeOf<Task>();
    expectTypeOf<Data<Api["projects"]["$get"]>>().toEqualTypeOf<Project[]>();
    expectTypeOf<Data<Api["tags"]["$get"]>>().toEqualTypeOf<Tag[]>();
    expectTypeOf<Data<Api["habits"]["weekly"]["$get"]>>().toExtend<Habit[]>();
    expectTypeOf<Data<Api["inbox"]["$get"]>>().toExtend<InboxItem[]>();
    expectTypeOf<Data<Api["sections"]["$get"]>>().toEqualTypeOf<TaskSection[]>();
    expectTypeOf<Data<Api["tasks"][":taskId"]["subtasks"]["$get"]>>().toExtend<Subtask[]>();
    expectTypeOf<Data<Api["settings"]["$get"]>>().toEqualTypeOf<SettingsView>();
    expectTypeOf<Data<Api["settings"]["focus-views"]["$get"]>>().toEqualTypeOf<SavedFocusView[]>();
    expectTypeOf<Data<Api["settings"]["notification-state"]["$get"]>>().toEqualTypeOf<NotificationState[]>();
    expectTypeOf<Data<Api["ai"]["conversations"]["$get"]>>().toEqualTypeOf<{ conversations: ConversationListItem[] }>();
    expectTypeOf<Data<Api["ai"]["conversations"][":id"]["$get"]>["conversation"]>().toEqualTypeOf<ConversationDetail>();
    expectTypeOf<Data<Api["proxy"]["weather"]["$get"]>>().toEqualTypeOf<WeatherReading>();
    expectTypeOf<Data<Api["proxy"]["geocode"]["reverse"]["$get"]>>().toEqualTypeOf<RegionInfo>();
    expectTypeOf<Data<Api["proxy"]["geocode"]["search"]["$get"]>>().toEqualTypeOf<CityResult[]>();
    expectTypeOf<Data<Api["proxy"]["geo"]["approximate"]["$get"]>>().toEqualTypeOf<ApproximatePlace>();
    expectTypeOf<Data<Api["proxy"]["holidays"]["$get"]>>().toEqualTypeOf<HolidayRecord[]>();
});
