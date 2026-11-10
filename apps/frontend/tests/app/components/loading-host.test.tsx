import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Loading, LoadingHost } from "../../../app/components/shared/Loading";

function Boot({ step }: { step: "fallback" | "session" | "workspace" | "done" }) {
    return (
        <>
            {step === "fallback" && <Loading key="fallback" />}
            {step === "session" && <Loading key="session" />}
            {step === "workspace" && <Loading title="Preparing your workspace"><p>Taking longer than usual</p></Loading>}
            <LoadingHost />
        </>
    );
}

describe("loading host", () => {
    it("keeps one scene through every hand-off and drops it a frame after the last", async () => {
        const view = render(<Boot step="fallback" />);
        const scene = document.querySelector(".loading-screen");
        expect(scene).not.toBeNull();

        view.rerender(<Boot step="session" />);
        view.rerender(<Boot step="workspace" />);
        // Same element: the entrance and the loops never restart.
        expect(document.querySelector(".loading-screen")).toBe(scene);
        expect(screen.getByRole("status").textContent).toBe("Preparing your workspace");
        // The request's children portal under the dots.
        expect(scene!.querySelector(".loading-dots + .contents")?.textContent).toBe("Taking longer than usual");

        view.rerender(<Boot step="done" />);
        expect(document.querySelector(".loading-screen")).toBe(scene);
        await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
        expect(document.querySelector(".loading-screen")).toBeNull();
    });

    it("turns a title with progress into a bar that fills before the scene leaves", async () => {
        // jsdom has no Web Animations; the fill only needs a handle it can cancel.
        const animate = vi.fn(() => ({ cancel: () => undefined, finished: new Promise(() => undefined), effect: null }));
        Element.prototype.animate = animate as unknown as Element["animate"];
        const now = vi.spyOn(performance, "now");
        now.mockReturnValue(0);
        const Startup = ({ pending }: { pending: boolean }) => <>{pending && <Loading title="Preparing your workspace" progress={0.5} />}<LoadingHost /></>;
        const view = render(<Startup pending />);
        expect(document.querySelector(".ls-title-muted")?.textContent).toBe("Preparing your workspace");
        // 50% of the known work is 50% along the 10–90% band (the text, which moves against its clip box).
        const lastTarget = () => String((animate.mock.lastCall as unknown as [{ translate: string[] }])[0].translate[1]);
        expect(lastTarget()).toMatch(/^calc\(0.5 \*/);

        // On screen long enough to read: it fills to the end, then leaves.
        now.mockReturnValue(1_000);
        view.rerender(<Startup pending={false} />);
        expect(lastTarget()).toMatch(/^calc\(0 \*/);
        await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
        expect(document.querySelector(".loading-screen")).not.toBeNull();
        await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
        expect(document.querySelector(".loading-screen")).toBeNull();
        now.mockRestore();
    });
});
