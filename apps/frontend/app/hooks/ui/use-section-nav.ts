import { useRef, useCallback } from "react";

/**
 * Provides j/k section navigation by scrolling data-section-key elements
 * into view. Tracks "current" index via a ref.
 */
export function useSectionNav() {
    const currentIndex = useRef(0);

    const getSections = useCallback(() => {
        return Array.from(document.querySelectorAll<HTMLElement>("[data-section-key]"));
    }, []);

    const onNextSection = useCallback(() => {
        const sections = getSections();
        if (sections.length === 0) return;
        currentIndex.current = Math.min(currentIndex.current + 1, sections.length - 1);
        sections[currentIndex.current].scrollIntoView({ behavior: "smooth", block: "start" });
    }, [getSections]);

    const onPrevSection = useCallback(() => {
        const sections = getSections();
        if (sections.length === 0) return;
        currentIndex.current = Math.max(currentIndex.current - 1, 0);
        sections[currentIndex.current].scrollIntoView({ behavior: "smooth", block: "start" });
    }, [getSections]);

    return { onNextSection, onPrevSection };
}
