import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxItem } from "@cadence/contracts/inbox";
import { ClarifySheet } from "../../../app/components/holding/ClarifySheet";
import { Provider } from "../../../app/components/primitives/Tooltip";

const { process, update, parse } = vi.hoisted(() => ({ process: vi.fn(), update: vi.fn(), parse: vi.fn() }));
vi.mock("../../../app/hooks/inbox/use-process-inbox-to-task", () => ({ useProcessInboxToTask: () => ({ mutate: process, isPending: false }), todayISO: () => "2026-09-16", tomorrowISO: () => "2026-09-17" }));
vi.mock("../../../app/hooks/inbox/use-update-inbox-item", () => ({ useUpdateInboxItem: () => ({ mutate: update, isPending: false }) }));
vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: {} }) }));
vi.mock("../../../app/hooks/projects", () => ({ useProjects: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/tags", () => ({ useTags: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/use-nlp-parse", () => ({ useNlpParse: parse }));
vi.mock("../../../app/lib/api/track-event", () => ({ trackUsageEvent: vi.fn() }));
vi.mock("../../../app/lib/nlp/build-canonical-envelope", () => ({ buildCanonicalNlpEnvelope: (value: unknown) => value }));
vi.mock("../../../app/components/tasks/ParseSummaryChips", () => ({ ParseSummaryChips: ({ onDismiss }: { onDismiss: (id: string) => void }) => <button onClick={() => onDismiss("date-1")}>Dismiss detected date</button> }));
vi.mock("../../../app/components/tasks/QuickScheduleSurface", () => ({ QuickScheduleSurface: ({ onChange }: { onChange: (value: unknown) => void }) => <button onClick={() => onChange({ dueDate: "2026-09-20", recurrenceRule: "FREQ=WEEKLY", isAllDay: true })}>Pick custom schedule</button> }));
const item = { id: "capture-1", rawText: "Call Sam tomorrow", createdAt: "2026-09-15T12:00:00Z", aiSuggestion: "Keep it brief" } as InboxItem;
const close = vi.fn();
const openEditor = vi.fn();
const parsed = { cleanedTitle: "Call Sam", dueDate: "2026-09-17", dueHumanLabel: "Tomorrow", tagIds: ["tag-1"], projectId: "project-1", priority: 2, recurrenceRule: null };
function setup() { return render(<Provider><ClarifySheet item={item} onClose={close} onOpenFullEditor={openEditor} /></Provider>); }
beforeEach(() => { vi.clearAllMocks(); parse.mockReturnValue(parsed); vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }); });
afterEach(() => vi.unstubAllGlobals());
describe("Shared capture editor", () => {
    it("keeps suggestions and the edited title when placing a capture", () => {
        setup();
        expect(screen.getByRole("heading", { name: "Capture" })).toBeTruthy();
        expect(screen.getByText("Keep it brief")).toBeTruthy();
        fireEvent.change(screen.getByRole("textbox", { name: "Edit task title" }), { target: { value: "Call Sam about the project" } });
        fireEvent.click(screen.getByRole("button", { name: "Dismiss detected date" }));
        fireEvent.click(screen.getByRole("button", { name: /Today Schedule/ }));
        expect(process).toHaveBeenCalledWith(expect.objectContaining({ title: "Call Sam about the project", scheduledDate: "2026-09-16", projectId: "project-1", tagIds: ["tag-1"], nlp: expect.objectContaining({ dismissedEntityIds: ["date-1"] }) }), expect.any(Object));
    });
    it("preserves detected, tomorrow and custom schedule placement", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: /Use detected date/ }));
        expect(process.mock.calls.at(-1)?.[0].scheduledDate).toBe("2026-09-17");
        fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
        expect(process.mock.calls.at(-1)?.[0].scheduledDate).toBe("2026-09-17");
        fireEvent.click(screen.getByRole("button", { name: "Custom" }));
        fireEvent.click(screen.getByRole("button", { name: "Pick custom schedule" }));
        fireEvent.click(screen.getByRole("button", { name: "Place with this schedule" }));
        expect(process.mock.calls.at(-1)?.[0]).toMatchObject({ dueDate: "2026-09-20", recurrenceRule: "FREQ=WEEKLY", isAllDay: true });
    });
    it("hands the created task to the full editor only after placement succeeds", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: /Open full task editor/ }));
        expect(process.mock.calls[0][0].skipOptimisticRemoval).toBe(true);
        expect(openEditor).not.toHaveBeenCalled();
        process.mock.calls[0][1].onSuccess({ id: "task-1" });
        expect(openEditor).toHaveBeenCalledWith("task-1");
        expect(close).not.toHaveBeenCalled();
    });
    it("keeps close, collapse and discard separate", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: "Done" }));
        fireEvent.click(screen.getByRole("button", { name: /When.*Tomorrow/ }));
        expect(screen.getByRole("button", { name: "Custom" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Close clarify sheet" }));
        expect(close).toHaveBeenCalledOnce();
        expect(update).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: /Discard capture/ }));
        expect(update).toHaveBeenCalledWith({ id: "capture-1", captureStatus: "discarded" }, expect.any(Object));
    });
});
