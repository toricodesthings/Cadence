import { describe, expect, it } from "vitest";
import { checkPdf } from "../../src/platform/pdf";

const pdf = (body: string) => new TextEncoder().encode(`%PDF-1.4\n${body}\n%%EOF`);
const tree = (count: number) => `1 0 obj\n<< /Type /Pages /Kids [2 0 R] /Count ${count} >>\nendobj`;

describe("checkPdf", () => {
    it("reads the page count of a plain PDF", () => {
        expect(checkPdf(pdf(tree(12)))).toEqual({ pages: 12 });
    });

    it("ignores child page nodes (they have a /Parent)", () => {
        const body = `${tree(3)}\n2 0 obj\n<< /Type /Pages /Parent 1 0 R /Count 1 >>\nendobj`;
        expect(checkPdf(pdf(body))).toEqual({ pages: 3 });
    });

    it("accepts a PDF whose page tree can't be read", () => {
        expect(checkPdf(pdf("1 0 obj\n<< /Type /Catalog >>\nendobj"))).toEqual({ pages: null });
    });

    it("refuses a non-PDF, a locked PDF and a long PDF", () => {
        expect(() => checkPdf(new TextEncoder().encode("hello"))).toThrow(
            expect.objectContaining({ code: "FILE_UNSUPPORTED" }),
        );
        expect(() => checkPdf(pdf(`${tree(2)}\ntrailer << /Encrypt 5 0 R >>`))).toThrow(
            expect.objectContaining({ code: "FILE_LOCKED" }),
        );
        expect(() => checkPdf(pdf(tree(31)))).toThrow(expect.objectContaining({ code: "FILE_TOO_LONG" }));
        expect(checkPdf(pdf(tree(30)))).toEqual({ pages: 30 });
    });
});
