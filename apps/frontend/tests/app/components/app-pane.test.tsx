import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppPane } from "../../../app/components/shared/AppPane";
import { Provider } from "../../../app/components/primitives/Tooltip";

vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: { tasks: { intelligence: { nlpEnabled: true } } } }) }));
const { undoToast } = vi.hoisted(() => ({ undoToast: vi.fn() }));
vi.mock("../../../app/lib/utils/undo-toast", () => ({ toastUndo: undoToast }));

const onChange = vi.fn();
function Harness({ initial, initialUrl, title }: { initial: string | null; initialUrl: string | null; title: string }) {
    const [link, setLink] = useState({ linkedAppId: initial, linkedUrl: initialUrl });
    const [open, setOpen] = useState(false);
    return <AppPane value={link.linkedAppId} url={link.linkedUrl} title={title} kind="routine" open={open} onOpenChange={setOpen} onChange={(patch) => { onChange(patch); setLink(patch); }} />;
}
const pane = (value: string | null, title = "Check emails", url: string | null = null) => render(<Provider><Harness initial={value} initialUrl={url} title={title} /></Provider>);
const app = (linkedAppId: string | null) => ({ linkedAppId, linkedUrl: null });

beforeEach(() => vi.clearAllMocks());

describe("AppPane", () => {
    it("starts as one quiet App row with no Open", () => {
        pane(null);
        expect(screen.getByRole("button", { name: /^App/ }).textContent).toContain("Open an app or website in one tap");
        expect(screen.queryByRole("link")).toBeNull();
    });

    it("opens the chooser inline with suggestions above the rest, nothing selected", () => {
        pane(null);
        fireEvent.click(screen.getByRole("button", { name: /^App/ }));
        const chooser = screen.getByRole("region", { name: "Choose app" });
        expect(within(chooser).getByRole("searchbox", { name: "Find an app" })).toBeTruthy();
        const email = within(screen.getByRole("region", { name: "For email" })).getAllByRole("button").map((button) => button.textContent);
        expect(email[0]).toContain("Gmail");
        expect(screen.queryByText("Selected")).toBeNull();
    });

    it("choosing saves only that app and collapses to its row with a real Open link", () => {
        pane(null);
        fireEvent.click(screen.getByRole("button", { name: /^App/ }));
        fireEvent.click(screen.getByRole("button", { name: /Gmail/ }));
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith(app("gmail"));
        const open = screen.getByRole("link", { name: "Open Gmail website" });
        expect(open.getAttribute("href")).toBe("https://mail.google.com/");
        expect(open.getAttribute("target")).toBe("_blank");
        expect(screen.getByRole("button", { name: "App: Gmail. Change app" })).toBeTruthy();
    });

    it("choosing the saved app again collapses without a write", () => {
        pane("gmail");
        fireEvent.click(screen.getByRole("button", { name: "App: Gmail. Change app" }));
        fireEvent.click(screen.getByRole("button", { name: /Gmail.*Selected/ }));
        expect(onChange).not.toHaveBeenCalled();
    });

    it("removing clears with null and offers Undo that restores the id", () => {
        pane("gmail");
        fireEvent.click(screen.getByRole("button", { name: "App: Gmail. Change app" }));
        fireEvent.click(screen.getByRole("button", { name: "Remove app" }));
        expect(onChange).toHaveBeenCalledWith(app(null));
        const [message, undo] = undoToast.mock.calls[0];
        expect(message).toBe("App removed");
        undo();
        expect(onChange).toHaveBeenLastCalledWith(app("gmail"));
    });

    it("no match: says so, one Clear search restores the list", () => {
        pane(null);
        fireEvent.click(screen.getByRole("button", { name: /^App/ }));
        fireEvent.change(screen.getByRole("searchbox", { name: "Find an app" }), { target: { value: "Fax machine" } });
        expect(screen.getByText("No supported app matches “Fax machine”")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
        expect(screen.getByRole("button", { name: /Gmail/ })).toBeTruthy();
    });

    it("a saved id this build doesn't know shows as unavailable, never a guessed link", () => {
        pane("future-app");
        expect(screen.queryByRole("link")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "App: App unavailable. Change app" }));
        expect(screen.getByRole("button", { name: "Remove app" })).toBeTruthy();
    });
});

describe("AppPane website", () => {
    const openWebsite = () => {
        fireEvent.click(screen.getByRole("button", { name: /^App/ }));
        fireEvent.click(screen.getByRole("button", { name: /^Website/ }));
        return screen.getByRole("textbox", { name: "Website address" }) as HTMLInputElement;
    };

    it("is set apart from the apps and starts the field at https://", () => {
        pane(null);
        const input = openWebsite();
        expect(input.value).toBe("https://");
        expect(screen.getByRole("button", { name: "Open website" })).toBeTruthy(); // not a link until the address is valid
        expect(screen.queryByRole("link")).toBeNull();
    });

    it("Open is a real https link that saves the website, never the app", () => {
        pane("gmail");
        fireEvent.click(screen.getByRole("button", { name: "App: Gmail. Change app" }));
        fireEvent.click(screen.getByRole("button", { name: /^Website/ }));
        fireEvent.change(screen.getByRole("textbox", { name: "Website address" }), { target: { value: "https://www.Example.com/plan" } });
        const open = screen.getByRole("link", { name: "Open example.com" });
        expect(open.getAttribute("href")).toBe("https://www.example.com/plan");
        expect(open.getAttribute("target")).toBe("_blank");
        expect(open.getAttribute("rel")).toBe("noopener noreferrer");
        fireEvent.click(open);
        expect(onChange).toHaveBeenCalledWith({ linkedAppId: null, linkedUrl: "https://www.example.com/plan" });
    });

    it("Enter saves and folds back to a website row with its own Open", () => {
        pane(null);
        const input = openWebsite();
        fireEvent.change(input, { target: { value: "https://docs.example.org" } });
        fireEvent.submit(input.form!);
        expect(onChange).toHaveBeenCalledWith({ linkedAppId: null, linkedUrl: "https://docs.example.org/" });
        expect(screen.getByRole("button", { name: "App: docs.example.org. Change app" }).textContent).toContain("Website · Change");
        // The chooser is still animating closed; the collapsed row's link comes first.
        expect(screen.getAllByRole("link", { name: "Open docs.example.org" })[0].getAttribute("href")).toBe("https://docs.example.org/");
    });

    it.each(["javascript:alert(1)", "http://example.com", "https://user:pw@example.com", "https://localhost", "data:text/html,hi", "https://exa mple.com"])(
        "refuses %s: no link, nothing saved, says why", (address) => {
            pane(null);
            const input = openWebsite();
            fireEvent.change(input, { target: { value: address } });
            fireEvent.submit(input.form!);
            expect(onChange).not.toHaveBeenCalled();
            expect(screen.queryByRole("link")).toBeNull();
            expect(screen.getByText(/Use a full https:\/\/ address/)).toBeTruthy();
        },
    );

    it("a stored address that fails the check never becomes a link", () => {
        pane(null, "Read", "javascript:alert(1)");
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.getByRole("button", { name: "App: Website unavailable. Change app" })).toBeTruthy();
    });

    it("removing a website has Undo that restores it", () => {
        pane(null, "Read", "https://example.com/");
        fireEvent.click(screen.getByRole("button", { name: "App: example.com. Change app" }));
        fireEvent.click(screen.getByRole("button", { name: "Remove website" }));
        expect(onChange).toHaveBeenCalledWith(app(null));
        const [message, undo] = undoToast.mock.calls[0];
        expect(message).toBe("Website removed");
        undo();
        expect(onChange).toHaveBeenLastCalledWith({ linkedAppId: null, linkedUrl: "https://example.com/" });
    });
});
