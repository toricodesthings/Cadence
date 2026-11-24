import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Project } from "@cadence/contracts/project";
import { Provider as TooltipProvider } from "../../../app/components/primitives/Tooltip";
import { HEADER_ICON_BUTTON, HEADER_LABEL_BUTTON } from "../../../app/components/layout/PageHeader";
import { SortMenu } from "../../../app/components/shared/SortMenu";
import { ShareHeader } from "../../../app/components/sharing/ShareHeader";

vi.mock("../../../app/components/layout/LayoutScaleMenu", () => ({
    ClaimHeaderMenu: () => null,
    LayoutScaleMenuRow: () => null,
}));
vi.mock("../../../app/hooks/auth/use-auth-state", () => ({
    useAuthState: () => ({ authReady: true, isAuthenticated: true, session: { user: { id: "u-1" } } }),
}));
vi.mock("../../../app/hooks/sharing/use-list-people", () => ({ useListPeople: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/sharing/use-list-presence", () => ({ useListPresence: () => new Set() }));

const BASE = "surface-control inline-flex h-11";

describe("header buttons", () => {
    it("shares one tile between the icon and labelled variants", () => {
        expect(HEADER_ICON_BUTTON).toContain(BASE);
        expect(HEADER_LABEL_BUTTON).toContain(BASE);
        expect(HEADER_LABEL_BUTTON).toContain("px-3.5");
    });

    it("gives the ⋮ menu the tile and a tooltip", async () => {
        render(
            <TooltipProvider>
                <SortMenu mode="smart" onModeChange={() => {}} />
            </TooltipProvider>,
        );
        const button = screen.getByLabelText("Sort & display options");
        expect(button.className).toContain(BASE);
        act(() => button.focus());
        expect((await screen.findAllByText("Options")).length).toBeGreaterThan(0);
    });

    it("puts Share on the tile with a tooltip", async () => {
        render(
            <TooltipProvider>
                <ShareHeader project={{ access: "owner", members: [] } as unknown as Project} onOpen={() => {}} />
            </TooltipProvider>,
        );
        const button = screen.getByLabelText("Share list");
        expect(button.className).toContain(BASE);
        act(() => button.focus());
        expect((await screen.findAllByText("Share this list")).length).toBeGreaterThan(0);
    });
});
