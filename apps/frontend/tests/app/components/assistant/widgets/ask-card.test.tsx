import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AskCard } from "../../../../../app/components/assistant/widgets/AskCard";

const part = { state: "output-available", input: { question: "Which one?", options: [{ label: "COMP2000", description: "Due today" }, { label: "COMP3005" }] } };

describe("AskCard", () => {
    it("answers with a tapped option or typed words, and rests as the question once the thread moved on", () => {
        const reply = vi.fn();
        const { rerender } = render(<AskCard ctx={{ part, toolName: "ask_user", reply }} />);
        fireEvent.click(screen.getByRole("button", { name: /COMP2000/ }));
        expect(reply).toHaveBeenLastCalledWith("COMP2000");

        fireEvent.change(screen.getByLabelText("Your own answer"), { target: { value: " both of them " } });
        fireEvent.keyDown(screen.getByLabelText("Your own answer"), { key: "Enter" });
        expect(reply).toHaveBeenLastCalledWith("both of them");

        rerender(<AskCard ctx={{ part, toolName: "ask_user" }} />);
        expect(screen.getByText("Which one?")).toBeTruthy();
        expect(screen.queryByRole("button", { name: /COMP2000/ })).toBeNull();
    });
});
