import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ParseSummaryChips } from "../../../app/components/tasks/ParseSummaryChips";

describe("ParseSummaryChips", () => {
    it("dismisses entities by ParsedEntity.id", () => {
        const onDismiss = vi.fn();

        render(
            <ParseSummaryChips
                summary="Cadence understood: Tomorrow"
                entities={[
                    {
                        id: "due_date:tomorrow",
                        type: "due_date",
                        sourceText: "tomorrow",
                        start: 0,
                        end: 8,
                        confidence: "high",
                        normalizedValue: {
                            date: "2026-03-21",
                            datetime: null,
                            hasTime: false,
                            humanLabel: "Tomorrow",
                        },
                        explanation: "Detected date: Tomorrow",
                    } as any,
                ]}
                ignoredTokenIds={[]}
                onDismissToken={onDismiss}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: /dismiss: detected date/i }));

        expect(onDismiss).toHaveBeenCalledWith("due_date:tomorrow");
    });
});
