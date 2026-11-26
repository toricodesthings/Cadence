import * as ScrollArea from "../primitives/ScrollArea";

interface ScrollAreaWrapperProps {
    children: React.ReactNode;
    className?: string;
}

export function ScrollAreaWrapper({ children, className }: ScrollAreaWrapperProps) {
    return (
        <ScrollArea.Root className={`mobile-scroll-region h-full min-h-0 flex-1 ${className ?? ""}`}>
            <ScrollArea.Viewport className="scrollbar-thin [&>div]:!block">{children}</ScrollArea.Viewport>
            <ScrollArea.Scrollbar orientation="vertical">
                <ScrollArea.Thumb />
            </ScrollArea.Scrollbar>
        </ScrollArea.Root>
    );
}
