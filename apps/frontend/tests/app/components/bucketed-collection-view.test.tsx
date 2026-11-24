import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Flame } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import {
    BucketedCollectionView,
    type BucketedCollectionSection,
} from "../../../app/components/shared/BucketedCollectionView";

const section = (overrides: Partial<BucketedCollectionSection> = {}): BucketedCollectionSection => ({
    key: "routines",
    title: "Routines",
    icon: Flame,
    accentClass: "",
    count: 3,
    listContent: <p>Morning review</p>,
    boardContent: null,
    ...overrides,
});

const renderList = (sections: BucketedCollectionSection[]) =>
    render(
        <MemoryRouter>
            <BucketedCollectionView view="list" sections={sections} />
        </MemoryRouter>,
    );

describe("BucketedCollectionView list fold", () => {
    it("folds from anywhere on the header, not just the chevron", async () => {
        renderList([section()]);
        const header = screen.getByRole("button", { name: /Routines/ });
        expect(header.getAttribute("aria-expanded")).toBe("true");
        fireEvent.click(screen.getByText("Routines"));
        expect(header.getAttribute("aria-expanded")).toBe("false");
        await waitFor(() => expect(screen.queryByText("Morning review")).toBeNull());
    });

    // Regression: a section hidden on the board (Today's routines) left the row fold a no-op.
    it("uses a section's own fold state, so board and row stay in step", () => {
        const toggle = vi.fn();
        renderList([section({ listFold: { open: false, toggle } })]);
        expect(screen.queryByText("Morning review")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: /Routines/ }));
        expect(toggle).toHaveBeenCalledOnce();
    });

    it("shows the folded peek only while folded", async () => {
        const { rerender } = renderList([
            section({ listFold: { open: false, toggle: () => {} }, foldedPeek: <p>Next: deck</p> }),
        ]);
        expect(screen.getByText("Next: deck")).toBeTruthy();
        rerender(
            <MemoryRouter>
                <BucketedCollectionView
                    view="list"
                    sections={[section({ listFold: { open: true, toggle: () => {} }, foldedPeek: <p>Next: deck</p> })]}
                />
            </MemoryRouter>,
        );
        await waitFor(() => expect(screen.queryByText("Next: deck")).toBeNull());
        expect(screen.getByText("Morning review")).toBeTruthy();
    });
});
