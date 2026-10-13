import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppLinkField } from "../../../app/components/shared/AppLinkField";
import { AppLaunchLink } from "../../../app/components/shared/AppLaunchLink";
import { Provider } from "../../../app/components/primitives/Tooltip";

const shell = vi.hoisted(() => ({ compact: true }));
vi.mock("../../../app/hooks/ui/use-shell-mode", () => ({ useShellMode: () => ({ isCompact: shell.compact }) }));
vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: { tasks: { intelligence: { nlpEnabled: true } } } }) }));
const { undoToast } = vi.hoisted(() => ({ undoToast: vi.fn() }));
vi.mock("../../../app/lib/utils/undo-toast", () => ({ toastUndo: undoToast }));

const onChange = vi.fn();
const field = (value: string | null, title = "Check emails") => render(
    <Provider><AppLinkField value={value} title={title} kind="routine" onChange={onChange} /></Provider>,
);

beforeEach(() => { vi.clearAllMocks(); shell.compact = true; });

describe("AppLinkField", () => {
    it("starts as one quiet Add app field", () => {
        field(null);
        expect(screen.getByRole("button", { name: "App: Add app" })).toBeTruthy();
        expect(screen.queryByText("Choose app")).toBeNull();
    });

    it("opens the picker with suggestions above the rest, nothing selected", () => {
        field(null);
        fireEvent.click(screen.getByRole("button", { name: "App: Add app" }));
        expect(screen.getByRole("heading", { name: "Choose app" })).toBeTruthy();
        expect(screen.getByRole("heading", { name: "For email" })).toBeTruthy();
        const email = within(screen.getByRole("region", { name: "For email" })).getAllByRole("button").map((button) => button.textContent);
        expect(email[0]).toContain("Gmail");
        expect(screen.queryByText("Selected")).toBeNull();
    });

    it("choosing saves only that app and closes without launching", () => {
        field(null);
        fireEvent.click(screen.getByRole("button", { name: "App: Add app" }));
        fireEvent.click(screen.getByRole("button", { name: /Gmail/ }));
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith("gmail");
    });

    it("choosing the saved app again closes without a write", () => {
        field("gmail");
        fireEvent.click(screen.getByRole("button", { name: "App: Gmail" }));
        fireEvent.click(screen.getByRole("button", { name: /Gmail.*Selected/ }));
        expect(onChange).not.toHaveBeenCalled();
    });

    it("removing clears with null and offers Undo that restores the id", () => {
        field("gmail");
        fireEvent.click(screen.getByRole("button", { name: "App: Gmail" }));
        fireEvent.click(screen.getByRole("button", { name: "Remove app" }));
        expect(onChange).toHaveBeenCalledWith(null);
        const [message, undo] = undoToast.mock.calls[0];
        expect(message).toBe("App removed");
        undo();
        expect(onChange).toHaveBeenLastCalledWith("gmail");
    });

    it("no match: says so and Clear search restores the list", () => {
        field(null);
        fireEvent.click(screen.getByRole("button", { name: "App: Add app" }));
        fireEvent.change(screen.getByRole("searchbox", { name: "Find an app" }), { target: { value: "Apple Mail" } });
        expect(screen.getByText("No supported app matches “Apple Mail”")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
        expect(screen.getByRole("button", { name: /Gmail/ })).toBeTruthy();
    });

    it("a saved id this build doesn't know shows as unavailable, never a guessed link", () => {
        field("future-app");
        expect(screen.getByRole("button", { name: "App: App unavailable" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "App: App unavailable" }));
        expect(screen.getByRole("button", { name: "Remove app" })).toBeTruthy();
    });

    it("works as a popover on desktop", () => {
        shell.compact = false;
        field(null);
        fireEvent.click(screen.getByRole("button", { name: "App: Add app" }));
        fireEvent.click(screen.getByRole("button", { name: /Outlook/ }));
        expect(onChange).toHaveBeenCalledWith("outlook");
    });
});

describe("AppLaunchLink", () => {
    it("is a real link to the resolved destination, and absent without an app", () => {
        const { container, rerender } = render(<AppLaunchLink appId="gmail" />);
        const link = screen.getByRole("link", { name: "Open Gmail website" });
        expect(link.getAttribute("href")).toBe("https://mail.google.com/");
        expect(link.getAttribute("target")).toBe("_blank");
        rerender(<AppLaunchLink appId={null} />);
        expect(container.firstChild).toBeNull();
        rerender(<AppLaunchLink appId="future-app" />);
        expect(container.firstChild).toBeNull();
    });
});
