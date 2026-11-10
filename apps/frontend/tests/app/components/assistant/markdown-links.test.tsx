import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Markdown } from "../../../../app/components/assistant/Markdown";

const show = (text: string) => render(<MemoryRouter><Markdown>{text}</Markdown></MemoryRouter>);

describe("assistant links", () => {
    it("shows where an external link goes when its text hides it", () => {
        show("[Open your task](https://evil.example/?d=secret)");
        expect(screen.getByText((_, el) => el?.textContent === " (evil.example)")).toBeTruthy();
    });

    it("adds nothing when the text already shows the host, or the link stays in the app", () => {
        const { container } = show("See https://cadenceapp.cloud/help and [Today](/today)");
        expect(container.textContent).not.toMatch(/\(cadenceapp\.cloud\)/);
        expect(container.textContent).not.toMatch(/\(localhost\)/);
    });
});
