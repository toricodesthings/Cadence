import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { RouteErrorBoundary } from "../../../app/components/shared/RouteErrorBoundary";

function renderErrorBoundary(error: unknown) {
    return render(
        <MemoryRouter initialEntries={["/test"]}>
            <Routes>
                <Route
                    path="/test"
                    element={<RouteErrorBoundary error={error} />}
                />
                <Route path="/" element={<div>Home</div>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe("RouteErrorBoundary", () => {
    it("renders a generic error message for unknown errors", () => {
        renderErrorBoundary(new Error("kaboom"));
        expect(screen.getByText("Something went wrong")).toBeTruthy();
        expect(screen.getByText("This view couldn't load. Your other workspaces are still here.")).toBeTruthy();
    });

    it("shows reload and go home buttons", () => {
        renderErrorBoundary(new Error("fail"));
        expect(screen.getByRole("button", { name: /reload/i })).toBeTruthy();
        expect(screen.getByRole("button", { name: /go home/i })).toBeTruthy();
    });

    it("uses sanctuary-native styling classes", () => {
        const { container } = renderErrorBoundary(new Error("fail"));
        const card = container.querySelector(".border-twilight-border");
        expect(card).toBeTruthy();
    });
});
