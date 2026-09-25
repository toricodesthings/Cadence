import { QueryClient, IsRestoringProvider, useQuery, onlineManager } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lazy, type ReactNode } from "react";
import { WorkspaceStartup } from "../../../app/components/layout/WorkspaceStartup";
import { StartupSuspense } from "../../../app/components/shared/StartupSuspense";
import { testQueryClient, withClient } from "../../helpers";

vi.mock("../../../app/hooks/auth/use-auth-state", () => ({
    useAuthState: () => ({ authReady: true, isAuthenticated: true }),
}));
vi.mock("../../../app/components/shared/Loading", () => ({
    Loading: ({ children }: { children?: ReactNode }) => <div data-testid="startup">{children}</div>,
}));

function Data({ name, load, enabled = true }: { name: string; load: () => Promise<string>; enabled?: boolean }) {
    const { data } = useQuery({ queryKey: [name], queryFn: load, enabled });
    return <span>{data ?? `${name} pending`}</span>;
}
function mount(children: ReactNode, client = testQueryClient(), path = "/today") {
    const view = <MemoryRouter initialEntries={[path]}><WorkspaceStartup>{children}</WorkspaceStartup></MemoryRouter>;
    return { ...render(view, { wrapper: withClient(client) }), client };
}
afterEach(() => { onlineManager.setOnline(true); vi.useRealTimers(); });

describe("workspace startup", () => {
    it("waits for a lazy first-screen component and the requests it starts", async () => {
        const module = Promise.withResolvers<{ default: () => ReactNode }>();
        const tasks = Promise.withResolvers<string>();
        const LazyPage = lazy(() => module.promise);
        mount(<StartupSuspense fallback={null}><LazyPage /></StartupSuspense>);
        await new Promise((resolve) => setTimeout(resolve, 80));
        expect(screen.queryByTestId("startup")).not.toBeNull();
        await act(async () => module.resolve({ default: () => <Data name="tasks" load={() => tasks.promise} /> }));
        await screen.findByText("tasks pending");
        expect(screen.queryByTestId("startup")).not.toBeNull();
        await act(async () => tasks.resolve("Ready"));
        await waitFor(() => expect(screen.queryByTestId("startup")).toBeNull());
    });

    it("starts independent route and child queries together and hides the screen until both finish", async () => {
        const tasks = Promise.withResolvers<string>();
        const projects = Promise.withResolvers<string>();
        const loadTasks = vi.fn(() => tasks.promise);
        const loadProjects = vi.fn(() => projects.promise);
        const { container } = mount(<><Data name="tasks" load={loadTasks} /><Data name="projects" load={loadProjects} /></>);
        expect(loadTasks).toHaveBeenCalledTimes(1);
        expect(loadProjects).toHaveBeenCalledTimes(1);
        expect(container.querySelector("[inert]")).not.toBeNull();
        await act(async () => tasks.resolve("Tasks ready"));
        expect(screen.queryByTestId("startup")).not.toBeNull();
        await act(async () => projects.resolve("Projects ready"));
        await waitFor(() => expect(screen.queryByTestId("startup")).toBeNull());
        expect(container.querySelector("[inert]")).toBeNull();
    });

    it("waits for dependent queries mounted by the first response", async () => {
        const settings = Promise.withResolvers<string>();
        const tasks = Promise.withResolvers<string>();
        function Dependent() {
            const { data } = useQuery({ queryKey: ["settings"], queryFn: () => settings.promise });
            return data ? <Data name="tasks" load={() => tasks.promise} /> : null;
        }
        mount(<Dependent />);
        await act(async () => settings.resolve("ready"));
        await screen.findByText("tasks pending");
        await new Promise((resolve) => setTimeout(resolve, 80));
        expect(screen.queryByTestId("startup")).not.toBeNull();
        await act(async () => tasks.resolve("Ready"));
        await waitFor(() => expect(screen.queryByTestId("startup")).toBeNull());
    });

    it("reuses cached data without waiting for background refresh and ignores disabled queries", async () => {
        const client = new QueryClient();
        client.setQueryData(["tasks"], "Cached tasks");
        mount(<><Data name="tasks" load={() => new Promise(() => {})} /><Data name="disabled" enabled={false} load={vi.fn()} /></>, client);
        await waitFor(() => expect(screen.queryByTestId("startup")).toBeNull());
        expect(screen.queryByText("Cached tasks")).not.toBeNull();
    });

    it("keeps failed initial data hidden and retries it", async () => {
        const load = vi.fn().mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue("Recovered");
        mount(<Data name="tasks" load={load} />);
        fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
        await waitFor(() => expect(screen.queryByTestId("startup")).toBeNull());
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("explains offline startup instead of revealing an empty workspace", async () => {
        onlineManager.setOnline(false);
        mount(<Data name="tasks" load={async () => "Ready"} />);
        await screen.findByText("You're offline. Connect to load this workspace.");
        expect(screen.queryByTestId("startup")).not.toBeNull();
        act(() => onlineManager.setOnline(true));
        await waitFor(() => expect(screen.queryByTestId("startup")).toBeNull());
    });

    it("does not bring startup back for navigation or subsequent requests", async () => {
        function Routes() {
            const navigate = useNavigate();
            return <button onClick={() => navigate("/schedule")}>Navigate</button>;
        }
        const { client } = mount(<Routes />);
        await waitFor(() => expect(screen.queryByTestId("startup")).toBeNull());
        fireEvent.click(screen.getByRole("button", { name: "Navigate" }));
        void client.fetchQuery({ queryKey: ["later"], queryFn: () => new Promise(() => {}) });
        expect(screen.queryByTestId("startup")).toBeNull();
    });

    it("does not gate public pages", () => {
        mount(<Data name="tasks" load={() => new Promise(() => {})} />, undefined, "/help-feedback");
        expect(screen.queryByTestId("startup")).toBeNull();
    });

    it("waits for persisted cache restoration", async () => {
        mount(<IsRestoringProvider value={true}><WorkspaceStartup>Restoring</WorkspaceStartup></IsRestoringProvider>);
        await new Promise((resolve) => setTimeout(resolve, 80));
        expect(screen.queryAllByTestId("startup").length).toBeGreaterThan(0);
    });

    it("lets optional decoration fall back after four seconds without releasing pending tasks", async () => {
        vi.useFakeTimers();
        const tasks = Promise.withResolvers<string>();
        mount(<><Data name="tasks" load={() => tasks.promise} /><Data name="weather" load={() => new Promise(() => {})} /></>);
        await act(async () => { await vi.advanceTimersByTimeAsync(4_100); });
        expect(screen.queryByText("Your workspace is taking longer than usual to load.")).not.toBeNull();
        expect(screen.queryByTestId("startup")).not.toBeNull();
        await act(async () => { tasks.resolve("Ready"); await vi.advanceTimersByTimeAsync(100); });
        expect(screen.queryByTestId("startup")).toBeNull();
    });
});
