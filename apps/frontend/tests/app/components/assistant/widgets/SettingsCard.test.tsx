import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ASSISTANT_SETTING_PATHS } from "@cadence/contracts/settings";
import { SETTING_LABELS } from "../../../../../app/lib/ai/settings-labels";

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("../../../../../app/hooks/core/use-settings", () => ({
    useSettings: () => ({ data: { tasks: { showStreaks: true } } }),
    useUpdateSettings: () => ({ mutate: mocks.mutate }),
}));

import { SettingsCard } from "../../../../../app/components/assistant/widgets/SettingsCard";

const input = { patch: { tasks: { showStreaks: false } } };

describe("SettingsCard", () => {
    it("shows what changes from the cached value and answers the approval", () => {
        const answer = vi.fn();
        render(
            <SettingsCard
                ctx={{ part: { state: "approval-requested", input }, toolName: "update_settings", answer } as never}
            />,
        );
        expect(screen.getByText("Routine streaks")).toBeTruthy();
        expect(screen.getByText("On → Off")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Change" }));
        expect(answer).toHaveBeenCalledWith(true, undefined);
    });

    it("once applied, Undo sends the old values as a patch", () => {
        const undo = { tasks: { showStreaks: true } };
        render(
            <SettingsCard
                ctx={
                    {
                        part: {
                            state: "output-available",
                            input,
                            output: { changed: [{ key: "tasks.showStreaks", from: true, to: false }], undo },
                        },
                        toolName: "update_settings",
                    } as never
                }
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
        expect(mocks.mutate).toHaveBeenCalledWith(undo);
        expect(screen.getByText("Put back")).toBeTruthy();
    });
});

describe("SETTING_LABELS", () => {
    it("names and iconifies every setting the assistant can change", () => {
        expect(ASSISTANT_SETTING_PATHS.filter((path) => !SETTING_LABELS[path])).toEqual([]);
    });
});
