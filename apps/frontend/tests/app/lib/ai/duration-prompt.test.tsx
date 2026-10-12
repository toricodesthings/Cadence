import { beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => ({ custom: vi.fn(), dismiss: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("../../../../app/lib/utils/user-zone", () => ({ today: () => "2026-10-12" }));

import { offerDuration } from "../../../../app/lib/ai/duration-prompt";

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
});

describe("offerDuration", () => {
    const task = { id: "t1", title: "Lab report" };

    it("asks once a day, in Full only", () => {
        offerDuration(task, "basic", vi.fn());
        offerDuration(task, "off", vi.fn());
        offerDuration(task, null, vi.fn());
        expect(toastMock.custom).not.toHaveBeenCalled();

        offerDuration(task, "full", vi.fn());
        offerDuration(task, "full", vi.fn());
        expect(toastMock.custom).toHaveBeenCalledTimes(1);
    });

    it("asks again the next day", () => {
        offerDuration(task, "full", vi.fn());
        localStorage.setItem("cadence-duration-asked-on", "2026-10-11");
        offerDuration(task, "full", vi.fn());
        expect(toastMock.custom).toHaveBeenCalledTimes(2);
    });
});
