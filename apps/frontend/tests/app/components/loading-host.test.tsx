import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Loading, LoadingHost } from "../../../app/components/shared/Loading";
import { flyMs } from "../../../app/components/shared/loading/flight";

// jsdom has no Web Animations; record calls and hand back a reversible handle.
function mockAnimate() {
    const reverse = vi.fn(function (this: { playbackRate: number }) {
        this.playbackRate *= -1;
    });
    // A flight (fill: "both") finishes after its duration; the rest run on.
    const animate = vi.fn((_: unknown, options?: KeyframeAnimationOptions) => ({
        cancel: () => undefined,
        reverse,
        playbackRate: 1,
        finished: new Promise((resolve) => {
            if (options?.fill === "both") setTimeout(resolve, Number(options.duration));
        }),
        effect: null,
    }));
    Element.prototype.animate = animate as unknown as Element["animate"];
    return { animate, reverse };
}
// The flight's animations are the only ones that hold both ends (fill: "both").
const flights = (animate: ReturnType<typeof mockAnimate>["animate"]) =>
    animate.mock.calls.filter((c) => (c as unknown as [unknown, KeyframeAnimationOptions])[1]?.fill === "both");
const wait = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

function Boot({ step }: { step: "fallback" | "session" | "workspace" | "done" }) {
    return (
        <>
            {step === "fallback" && <Loading key="fallback" />}
            {step === "session" && <Loading key="session" />}
            {step === "workspace" && (
                <Loading title="Preparing your workspace">
                    <p>Taking longer than usual</p>
                </Loading>
            )}
            <LoadingHost />
        </>
    );
}

describe("loading host", () => {
    it("keeps one scene through every hand-off and flies out a frame after the last", async () => {
        const { animate } = mockAnimate();
        const view = render(<Boot step="fallback" />);
        const scene = document.querySelector(".loading-screen");
        expect(scene).not.toBeNull();

        view.rerender(<Boot step="session" />);
        view.rerender(<Boot step="workspace" />);
        // Same element: the entrance and the loops never restart.
        expect(document.querySelector(".loading-screen")).toBe(scene);
        // A fast start never names itself; the title waits until the load is slow enough to read it.
        expect(screen.getByRole("status").textContent).toBe("Cadence");
        await wait(1000);
        expect(screen.getByRole("status").textContent).toBe("Preparing your workspace");
        // The request's children portal under the wordmark.
        expect(scene!.querySelector(".ls-wordmark + .contents")?.textContent).toBe("Taking longer than usual");

        view.rerender(<Boot step="done" />);
        expect(document.querySelector(".loading-screen")).toBe(scene);
        expect(flights(animate)).toHaveLength(0);
        await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
        // Leaving: still drawn, but out of the way of clicks, Tab and screen readers.
        expect(document.querySelector(".loading-screen")).toBe(scene);
        expect(scene!.hasAttribute("data-leaving")).toBe(true);
        expect(scene!.hasAttribute("inert")).toBe(true);
        expect(flights(animate).length).toBeGreaterThan(0);
        // The screen itself fades out last of all.
        expect((flights(animate).at(-1) as unknown as [Keyframe[]])[0].at(-1)).toMatchObject({ offset: 1, opacity: 0 });
        await wait(flyMs());
        expect(document.querySelector(".loading-screen")).toBeNull();
    });

    it("names a late step at once when the scene has already been up long enough", async () => {
        mockAnimate();
        const view = render(<Boot step="session" />);
        await wait(1000);
        view.rerender(<Boot step="workspace" />);
        expect(screen.getByRole("status").textContent).toBe("Preparing your workspace");
        view.rerender(<Boot step="done" />);
        await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
        await wait(flyMs());
        expect(document.querySelector(".loading-screen")).toBeNull();
    });

    it("glides back when loading resumes mid-flight", async () => {
        const { animate, reverse } = mockAnimate();
        const Step = ({ on }: { on: boolean }) => (
            <>
                {on && <Loading />}
                <LoadingHost />
            </>
        );
        const view = render(<Step on />);
        const scene = document.querySelector(".loading-screen");
        view.rerender(<Step on={false} />);
        await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
        expect(scene!.hasAttribute("data-leaving")).toBe(true);

        view.rerender(<Step on />);
        expect(document.querySelector(".loading-screen")).toBe(scene);
        expect(scene!.hasAttribute("data-leaving")).toBe(false);
        // Every layer glides back from where it is.
        const layers = flights(animate).length;
        expect(reverse).toHaveBeenCalledTimes(layers);
        // The unmount timer was cancelled: the scene stays.
        await wait(flyMs());
        expect(document.querySelector(".loading-screen")).toBe(scene);
        expect(flights(animate)).toHaveLength(layers);

        view.rerender(<Step on={false} />);
        await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
        expect(reverse).toHaveBeenCalledTimes(2 * layers);
        await wait(flyMs());
        expect(document.querySelector(".loading-screen")).toBeNull();
    });

    it("turns a title with progress into a bar that fills before the scene leaves", async () => {
        const { animate } = mockAnimate();
        const now = vi.spyOn(performance, "now");
        now.mockReturnValue(0);
        const Startup = ({ pending }: { pending: boolean }) => (
            <>
                {pending && <Loading title="Preparing your workspace" progress={0.5} />}
                <LoadingHost />
            </>
        );
        const view = render(<Startup pending />);
        await wait(1000);
        expect(document.querySelector(".ls-title-muted")?.textContent).toBe("Preparing your workspace");
        // 50% of the known work is 50% along the 10–90% band (the text, which moves against its clip box).
        const lastTarget = () =>
            String(
                (
                    animate.mock.calls
                        .filter((c) => "translate" in (c as unknown as [object])[0])
                        .at(-1) as unknown as [{ translate: string[] }]
                )[0].translate[1],
            );
        expect(lastTarget()).toMatch(/^calc\(0.5 \*/);

        // On screen long enough to read: it fills to the end, then leaves.
        now.mockReturnValue(1_000);
        view.rerender(<Startup pending={false} />);
        // The bar fills and the flight starts in the same commit.
        expect(lastTarget()).toMatch(/^calc\(0 \*/);
        expect(document.querySelector(".loading-screen")?.hasAttribute("data-leaving")).toBe(true);
        expect(flights(animate).length).toBeGreaterThan(0);
        await wait(flyMs());
        expect(document.querySelector(".loading-screen")).toBeNull();
        now.mockRestore();
    });
});
