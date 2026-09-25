import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { RouteErrorBoundary } from "../../../app/components/shared/RouteErrorBoundary";

const renderErrorBoundary = (error: unknown) => render(<MemoryRouter><RouteErrorBoundary error={error} /></MemoryRouter>);

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
});
