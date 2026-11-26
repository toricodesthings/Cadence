import * as RadixScrollArea from "@radix-ui/react-scroll-area";

export const Root = ({
    className = "",
    ...props
}: RadixScrollArea.ScrollAreaProps & { ref?: React.Ref<HTMLDivElement> }) => (
    <RadixScrollArea.Root data-slot="scroll-area-root" className={`min-h-0 ${className}`} {...props} />
);

export const Viewport = ({
    className = "",
    ...props
}: RadixScrollArea.ScrollAreaViewportProps & { ref?: React.Ref<HTMLDivElement> }) => (
    <RadixScrollArea.Viewport
        data-slot="scroll-area-viewport"
        className={`h-full min-h-0 [&>div]:block! ${className}`}
        {...props}
    />
);

export const Scrollbar = ({
    className = "",
    orientation = "vertical",
    ...props
}: RadixScrollArea.ScrollAreaScrollbarProps & { ref?: React.Ref<HTMLDivElement> }) => (
    <RadixScrollArea.Scrollbar orientation={orientation} className={`w-1 p-px ${className}`} {...props} />
);

export const Thumb = ({
    className = "",
    ...props
}: RadixScrollArea.ScrollAreaThumbProps & { ref?: React.Ref<HTMLDivElement> }) => (
    <RadixScrollArea.Thumb className={`rounded-full bg-white/8 ${className}`} {...props} />
);
