import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../../app/hooks/tasks/use-tasks", () => ({ useTask: () => undefined }));
vi.mock("../../../../../app/hooks/tasks/use-find-time", () => ({ statusOf: vi.fn(), useFindTime: () => vi.fn() }));
vi.mock("../../../../../app/hooks/tasks/use-update-task", () => ({ useUpdateTask: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("../../../../../app/hooks/tasks/use-fit-day", () => ({ useFitDay: () => vi.fn() }));
vi.mock("../../../../../app/hooks/core/use-online-status", () => ({ useOnlineStatus: () => true }));

import { FindTimeCard } from "../../../../../app/components/assistant/widgets/PlanCards";

const card = (task: object) =>
    ({
        part: { state: "output-available", output: { ok: true, day: "2026-11-24", proposals: [], task } },
        toolName: "find_time",
    }) as never;

describe("FindTimeCard", () => {
    it("says an unsized task has no length yet, with no Place button", () => {
        render(<FindTimeCard ctx={card({ id: "t1", title: "Essay", notSized: true })} />);
        expect(screen.getByText("No length yet")).toBeTruthy();
        expect(screen.queryByRole("button", { name: /place/i })).toBeNull();
    });

    it("still says no gap fits for a sized task with none", () => {
        render(<FindTimeCard ctx={card({ id: "t1", title: "Essay", minutes: 45 })} />);
        expect(screen.getByText("No gap that fits")).toBeTruthy();
    });
});
