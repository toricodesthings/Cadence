import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TasksTab } from "../../../../app/components/settings/tabs/TasksTab";
import { SETTINGS_DEFAULTS } from "../../../../app/types/settings";

const m = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("../../../../app/hooks/core/use-settings", () => ({
    useSettings: () => ({ data: SETTINGS_DEFAULTS }),
    useUpdateSettings: () => ({ mutate: m.mutate }),
}));
vi.mock("../../../../app/hooks/auth/use-api-client", () => ({ useApiClient: () => ({}) }));

beforeEach(() => m.mutate.mockClear());

it("Tag by list and section is on by default and turns off with one tap", () => {
    render(<TasksTab />);
    const toggle = screen.getByRole("switch", { name: /Tag by list and section/ });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(m.mutate).toHaveBeenCalledWith({ tasks: { autoTag: false } });
});
