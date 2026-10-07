import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTypedWhen } from "../../../app/hooks/use-typed-when";

const nlp = { scheduledStart: null, scheduledEnd: null, dueDate: null, durationMinutes: null };
const initial = { date: "2026-09-23", allDay: false, start: "15:00", end: "16:00" };

describe("useTypedWhen", () => {
    it("pushes the end an hour out when an edit makes it equal the start", () => {
        const { result } = renderHook(() => { const w = useTypedWhen(initial); return w.bind(nlp); });
        act(() => result.current.edit({ start: "16:00" }));
        expect(result.current.when).toMatchObject({ start: "16:00", end: "17:00" });
        act(() => result.current.edit({ end: "16:00" }));
        expect(result.current.when).toMatchObject({ start: "16:00", end: "17:00" });
    });
});
