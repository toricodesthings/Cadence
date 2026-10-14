import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimeGutter } from "../../../app/components/calendar/TimeGutter";

describe("TimeGutter", () => {
    it("puts each hour's label in the row that starts at that hour", () => {
        const { container } = render(<TimeGutter hourHeight={72} />);
        const gutter = container.firstElementChild as HTMLElement;
        const rows = Array.from(gutter.children) as HTMLElement[];
        expect(parseFloat(gutter.style.paddingTop || "0") + rows.slice(0, 10).reduce((top, row) => top + parseFloat(row.style.height), 0)).toBe(10 * 72);
    });
});
