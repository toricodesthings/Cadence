import * as ScrollArea from "../primitives/ScrollArea";

interface ScrollAreaWrapperProps {
    children: React.ReactNode;
    className?: string;
}

/** Full-height scroll container using the ScrollArea primitive */
export function ScrollAreaWrapper({ children, className }: ScrollAreaWrapperProps) {
    return (
        <ScrollArea.Root className={`mobile-scroll-region h-full ${className ?? ""}`}>
            <ScrollArea.Viewport className="scrollbar-thin">
                {children}
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar orientation="vertical">
                <ScrollArea.Thumb />
            </ScrollArea.Scrollbar>
        </ScrollArea.Root>
    );
}
