import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { atLocal } from "@cadence/domain/time";
import { makeTask } from "../../../helpers";

const m = vi.hoisted(() => ({ place: vi.fn(), mutateAsync: vi.fn(), online: true }));
vi.mock("../../../../app/hooks/tasks/use-fit-day", () => ({ usePlaceTasks: () => m.place }));
vi.mock("../../../../app/hooks/tasks/use-update-task", () => ({ useUpdateTask: () => ({ mutateAsync: m.mutateAsync }) }));
vi.mock("../../../../app/hooks/core/use-online-status", () => ({ useOnlineStatus: () => m.online }));

import { FitDayPreview } from "../../../../app/components/today/FitDayPreview";
import { Provider as TooltipProvider } from "../../../../app/components/primitives/Tooltip";
import { setUserZone } from "../../../../app/lib/utils/user-zone";

const zone = "America/Toronto";
setUserZone(zone);
const day = "2026-10-20";
const at = (time: string) => atLocal(day, time, zone);

const essay = makeTask({ id: "essay", title: "Essay", dueDate: day, durationEstimate: 60 });
const email = makeTask({ id: "email", title: "Email", dueDate: day, durationEstimate: 30 });
const garage = makeTask({ id: "garage", title: "Garage", dueDate: day });
const fit = (over: object = {}) => ({
    ready: true,
    candidates: [essay, email, garage],
    byId: new Map([essay, email, garage].map((t) => [t.id, t])),
    busy: [],
    timelineStartHour: 7,
    minutesOf: () => null,
    refresh: vi.fn(async () => {}),
    plan: vi.fn(() => ({ placed: [{ taskId: "garage", start: at("15:00"), end: at("15:45") }], didntFit: [], notSized: [] })),
    ...over,
});
const initial = {
    placed: [{ taskId: "essay", start: at("09:00"), end: at("10:00") }, { taskId: "email", start: at("10:15"), end: at("10:45") }],
    didntFit: ["thesis"],
    notSized: ["garage"],
};

beforeEach(() => {
    vi.clearAllMocks();
    m.online = true;
    m.place.mockResolvedValue({});
    m.mutateAsync.mockResolvedValue({});
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(atLocal("2026-10-20", "08:00", zone)));
});

const setup = (over: object = {}, props: object = {}) => {
    const onDone = vi.fn();
    const f = fit(over);
    render(<TooltipProvider><FitDayPreview day={day} fit={f as never} initial={initial} titles={new Map([["thesis", "Thesis"]])} onDone={onDone} {...props} /></TooltipProvider>);
    return { onDone, f };
};

describe("FitDayPreview", () => {
    it("shows each placement as a ghost and a row, what didn't fit, and the unsized tasks with length chips", () => {
        setup();
        expect(screen.getByRole("slider", { name: "Essay" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Leave Email out" })).toBeTruthy();
        expect(screen.getByText(/1 didn’t fit · they stay on today/)).toBeTruthy();
        expect(screen.getByText("1 not sized")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Place 2" })).toBeTruthy();
    });

    it("× drops a row and the arrow keys move one ghost by 15 minutes, leaving the others", async () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: "Leave Email out" }));
        fireEvent.keyDown(screen.getByRole("slider", { name: "Essay" }), { key: "ArrowRight" });
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Place 1" })); });
        expect(m.place).toHaveBeenCalledWith([{ taskId: "essay", start: new Date(at("09:15")).toISOString(), end: new Date(at("10:15")).toISOString() }], expect.any(Map));
    });

    it("a chosen length stores the estimate and adds the task to the preview", async () => {
        const { f } = setup();
        await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: "30 min" })[0]); });
        expect(m.mutateAsync).toHaveBeenCalledWith({ id: "garage", durationEstimate: 30 });
        expect(f.plan).toHaveBeenCalledWith([expect.objectContaining({ id: "garage", durationEstimate: 30 })], expect.any(Array));
        expect(screen.getByRole("button", { name: "Place 3" })).toBeTruthy();
    });

    it("places all of them and closes; a 409 says the day changed and lays it out again", async () => {
        const { onDone, f } = setup();
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Place 2" })); });
        expect(onDone).toHaveBeenCalledWith(true);

        m.place.mockRejectedValueOnce(Object.assign(new Error("conflict"), { status: 409 }));
        onDone.mockClear();
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Place 2" })); });
        expect(onDone).not.toHaveBeenCalled();
        expect(f.refresh).toHaveBeenCalled();
        expect(screen.getByText("Your day changed")).toBeTruthy();
        expect(f.plan).toHaveBeenCalled();
    });

    it("is disabled offline, and Cancel writes nothing", () => {
        m.online = false;
        const { onDone } = setup();
        expect((screen.getByRole("button", { name: "Place 2" }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText("Needs a connection")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onDone).toHaveBeenCalledWith(false);
        expect(m.place).not.toHaveBeenCalled();
    });
});
