import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HelpPage } from "../../../app/components/help/HelpPage";

function HistoryBack() {
    const navigate = useNavigate();
    return <button onClick={() => navigate(-1)}>Browser back</button>;
}

function renderHelp(path = "/help-feedback") {
    return render(<MemoryRouter initialEntries={[path]}><HelpPage /><HistoryBack /></MemoryRouter>);
}

beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
});

describe("Help navigation", () => {
    it("opens a feature, focuses its guide, and returns through browser history", async () => {
        renderHelp();
        fireEvent.click(screen.getByRole("link", { name: "Capture" }));
        const guide = await screen.findByRole("heading", { name: "Capture" });
        await waitFor(() => expect(document.activeElement).toBe(guide));
        expect(screen.getByRole("link", { name: "Capture" }).getAttribute("aria-current")).toBe("page");
        fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
        await waitFor(() => expect(screen.queryByRole("article")).toBeNull());
        expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Help & Feedback" }));
    });

    it("filters features, explains an empty result and restores the directory", () => {
        renderHelp();
        const search = screen.getByRole("searchbox", { name: "Find a feature" });
        fireEvent.change(search, { target: { value: "  ROUTINES " } });
        const nav = screen.getByRole("navigation", { name: "Help features" });
        expect(within(nav).getAllByRole("link")).toHaveLength(1);
        expect(within(nav).getByRole("link").textContent).toContain("Routines");
        fireEvent.change(search, { target: { value: "no such feature" } });
        expect(screen.getByRole("status").textContent).toContain("No features match");
        fireEvent.click(screen.getByRole("button", { name: "Show all features" }));
        expect(within(nav).getAllByRole("link").length).toBeGreaterThan(1);
    });

    it("finds the Intelligence layer and opens its Memory guide", async () => {
        renderHelp();
        fireEvent.change(screen.getByRole("searchbox", { name: "Find a feature" }), { target: { value: "Cadence Intelligence" } });
        expect(screen.getByRole("link", { name: "Natural language (NLP)" })).toBeTruthy();
        expect(screen.getByRole("link", { name: "Decisioning" })).toBeTruthy();
        expect(screen.getAllByRole("link", { name: "Assistant" })).toHaveLength(1);
        fireEvent.click(screen.getByRole("link", { name: "Memory" }));
        const guide = await screen.findByRole("article", { name: "Memory" });
        expect(within(guide).getByText("Cadence Intelligence")).toBeTruthy();
        await waitFor(() => expect(document.activeElement).toBe(within(guide).getByRole("heading", { name: "Memory" })));
    });

    it("drills into a guide on compact screens and keeps feedback inactive", async () => {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
        renderHelp("/help-feedback?feature=schedule");
        expect(screen.getByRole("heading", { name: "Schedule" })).toBeTruthy();
        expect(screen.queryByRole("navigation", { name: "Help features" })).toBeNull();
        expect((screen.getByRole("button", { name: "Share feedback" }) as HTMLButtonElement).disabled).toBe(true);
        act(() => {
            Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
            window.dispatchEvent(new Event("resize"));
        });
        expect(screen.getByRole("navigation", { name: "Help features" })).toBeTruthy();
        fireEvent.click(screen.getByRole("link", { name: "All features" }));
        await waitFor(() => expect(screen.queryByRole("article")).toBeNull());
    });
});
