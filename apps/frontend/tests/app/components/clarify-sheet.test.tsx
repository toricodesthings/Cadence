import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxItem } from "@cadence/contracts/inbox";
import { ClarifySheet } from "../../../app/components/holding/ClarifySheet";
import { Provider } from "../../../app/components/primitives/Tooltip";
import { placementLabel } from "../../../app/lib/utils/date-format";
const { process, update, parse, status } = vi.hoisted(() => ({ process: vi.fn(), update: vi.fn(), parse: vi.fn(), status: vi.fn() }));
vi.mock("../../../app/hooks/inbox/use-process-inbox-to-task", () => ({ useProcessInboxToTask: () => ({ mutateAsync: process, isPending: false }), todayISO: () => "2026-09-16", tomorrowISO: () => "2026-09-17" }));
vi.mock("../../../app/hooks/inbox/use-update-inbox-item", () => ({ useUpdateInboxItem: () => ({ mutate: update, isPending: false }) }));
vi.mock("../../../app/hooks/inbox/use-capture-actions", () => ({ useCaptureActions: () => ({ setStatus: status }) }));
vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: { tasks: { intelligence: {} }, dateTime: { dateStyle: "mdy" } } }) }));
vi.mock("../../../app/hooks/projects/use-projects", () => ({ useProjects: () => ({ data: [{ id: "10000000-0000-4000-8000-0000000000a1", name: "Uni" }, { id: "10000000-0000-4000-8000-0000000000a2", name: "Work" }] }) }));
vi.mock("../../../app/hooks/sections/use-sections", () => ({ useSections: (projectId: string | null) => ({ data: projectId === "10000000-0000-4000-8000-0000000000a1" ? [{ id: "10000000-0000-4000-8000-0000000000b1", name: "COMP2000" }] : [] }) }));
vi.mock("../../../app/hooks/tags/use-tags", () => ({ useTags: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/use-nlp-parse", () => ({ useNlpParse: parse, TASK_FIELDS: new Set() }));
vi.mock("../../../app/components/holding/PlaceSheet", () => ({ useWeekLoad: () => ({ lightest: "2026-09-18" }) }));
vi.mock("../../../app/components/tasks/TagField", () => ({ TagField: () => null }));
vi.mock("../../../app/components/tasks/DraftRow", () => ({ DraftRow: () => null }));
vi.mock("../../../app/components/tasks/QuickScheduleSurface", () => ({ QuickScheduleSurface: ({ scheduledStart }: { scheduledStart: string }) => <div data-testid="custom-time">{scheduledStart}</div> }));
const item = { id: "capture-1", rawText: "Call Sam tomorrow at 3pm", createdAt: "2026-09-15T12:00:00Z" } as InboxItem;
const close = vi.fn();
const parsed = { cleanedTitle: "Call Sam", dueDate: "2026-09-17", scheduledStart: "2026-09-17T15:00:00-04:00", tagIds: [], projectId: null, priority: 2, recurrenceRule: null, parseResult: { entities: [] }, applied: [], suggestions: [], fields: {} };
function setup(over: Partial<InboxItem> = {}) { return render(<Provider><ClarifySheet item={{ ...item, ...over }} onClose={close} /></Provider>); }
const suggested = { suggestedPlacement: { projectId: "10000000-0000-4000-8000-0000000000a1", sectionId: "10000000-0000-4000-8000-0000000000b1", model: "m", probability: 0.97 } };
beforeEach(() => { vi.clearAllMocks(); parse.mockReturnValue(parsed); process.mockResolvedValue({ id: "task-1" }); });
describe("Shared capture editor", () => {
    it("saves edited titles on blur without converting the thought", () => {
        setup();
        const input = screen.getByRole("textbox", { name: "Edit thought title" });
        fireEvent.change(input, { target: { value: "Call Sam about the list" } });
        fireEvent.blur(input);
        expect(update).toHaveBeenCalledWith({ id: item.id, analysis: { userOverrides: { title: "Call Sam about the list" } } });
        expect(process).not.toHaveBeenCalled();
    });
    it("keeps the detected time and pre-fills custom scheduling with it", async () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: "Pick day…" }));
        expect(screen.getByTestId("custom-time").textContent).toBe(parsed.scheduledStart);
        await act(async () => fireEvent.click(screen.getByRole("button", { name: placementLabel(parsed.scheduledStart) })));
        expect(process).toHaveBeenCalledWith(expect.objectContaining({ scheduledStart: parsed.scheduledStart }));
    });
    it("places a typed day as an all-day scheduledDay", async () => {
        parse.mockReturnValue({ ...parsed, scheduledStart: null });
        setup();
        await act(async () => fireEvent.click(screen.getByRole("button", { name: placementLabel("2026-09-17") })));
        expect(process).toHaveBeenCalledWith(expect.objectContaining({ scheduledDay: "2026-09-17" }));
        expect(process.mock.calls[0][0]).not.toHaveProperty("scheduledDate");
    });
    it("keeps a dated thought with no day only through an explicit null schedule", async () => {
        setup();
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Keep with no day" })));
        expect(process).toHaveBeenCalledWith(expect.objectContaining({ dueDate: null, scheduledStart: null, scheduledEnd: null }));
        expect(process.mock.calls[0][0]).not.toHaveProperty("isAllDay");
        expect(close).toHaveBeenCalledOnce();
    });
    it("fills the suggested list and section in and sends both when placed", async () => {
        parse.mockReturnValue({ ...parsed, scheduledStart: null, dueDate: null });
        setup({ analysis: suggested });
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Keep with no day" })));
        expect(process).toHaveBeenCalledWith(expect.objectContaining({ projectId: "10000000-0000-4000-8000-0000000000a1", sectionId: "10000000-0000-4000-8000-0000000000b1" }));
    });
    it("keeps what the user picked over the suggestion, and drops a section from another list", async () => {
        parse.mockReturnValue({ ...parsed, scheduledStart: null, dueDate: null });
        setup({ analysis: { ...suggested, userOverrides: { projectId: "10000000-0000-4000-8000-0000000000a2" } } });
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Keep with no day" })));
        expect(process).toHaveBeenCalledWith(expect.objectContaining({ projectId: "10000000-0000-4000-8000-0000000000a2", sectionId: null }));
    });
    it("lets a picked None remove the suggestion", async () => {
        parse.mockReturnValue({ ...parsed, scheduledStart: null, dueDate: null });
        setup({ analysis: { ...suggested, userOverrides: { projectId: null } } });
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Keep with no day" })));
        expect(process).toHaveBeenCalledWith(expect.objectContaining({ projectId: null, sectionId: null }));
    });
});
