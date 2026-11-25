import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PhonePageHeader } from "../../../app/components/layout/PageHeader";
import { Provider as TooltipProvider } from "../../../app/components/primitives/Tooltip";

describe("PhonePageHeader back arrow", () => {
    it("zooms out from an arrow beside the title, with no label line", () => {
        const onZoomOut = vi.fn();
        render(
            <TooltipProvider>
                <PhonePageHeader
                    pageName="Schedule"
                    title="Wednesday 25 November"
                    meta="Today · light"
                    backLabel="November"
                    onZoomOut={onZoomOut}
                />
            </TooltipProvider>,
        );
        expect(screen.queryByText("November")).toBeNull();
        expect(screen.queryByText("Schedule")).toBeNull();
        expect(screen.getByRole("heading").textContent).toBe("Wednesday 25 NovemberToday · light");
        fireEvent.click(screen.getByRole("button", { name: "Back to November" }));
        expect(onZoomOut).toHaveBeenCalledOnce();
    });

    it("shows the page name when there is nowhere to zoom out to", () => {
        render(<PhonePageHeader pageName="Schedule" title="2026" />);
        expect(screen.getByText("Schedule")).toBeTruthy();
        expect(screen.queryByRole("button", { name: /Back to/ })).toBeNull();
    });
});
