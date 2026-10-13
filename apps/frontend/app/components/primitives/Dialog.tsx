"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { motion, useDragControls } from "framer-motion";
import { cn } from "../../lib/utils";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { SWIPE_THRESHOLD } from "../shared/ResponsiveOverlayPanel";
import { DIALOG_CONTENT, DIALOG_DESCRIPTION, DIALOG_FOOTER, DIALOG_HEADER, DIALOG_OVERLAY, DIALOG_SHEET, DIALOG_TITLE } from "./dialog-styles";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Overlay>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
        ref={ref}
        className={cn(DIALOG_OVERLAY, className)}
        {...props}
    />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/** The dialog's X button; use it directly when a layout places close inside its own header. */
const DialogCloseButton = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Close>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Close
        ref={ref}
        className={cn("btn-icon shrink-0 cursor-pointer text-twilight-text-muted opacity-70 transition-[opacity,background-color] duration-150 hover:bg-white/[0.06] hover:text-twilight-text hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 disabled:pointer-events-none", className)}
        {...props}
    >
        <X className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">Close</span>
    </DialogPrimitive.Close>
));
DialogCloseButton.displayName = "DialogCloseButton";

const DialogContent = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
        hideCloseButton?: boolean;
        /** False for a surface that is full screen at every size (the photo viewer). */
        phoneSheet?: boolean;
    }
>(({ className, children, hideCloseButton, phoneSheet = true, ...props }, ref) => {
    // A touch phone gets a docked sheet: drag the grabber down to dismiss, as every compact sheet does.
    const { isPhone, isTouch } = useShellMode();
    const sheet = phoneSheet && isPhone && isTouch;
    const dragControls = useDragControls();
    const close = React.useRef<HTMLButtonElement>(null);
    const content = (
        <>
            {sheet ? (
                <div onPointerDown={(event) => dragControls.start(event)} style={{ touchAction: "none" }} className="absolute inset-x-0 top-0 flex h-8 cursor-grab items-center justify-center active:cursor-grabbing" aria-hidden="true">
                    <div className="h-1 w-10 rounded-full bg-twilight-text-muted/40" />
                </div>
            ) : null}
            {children}
            {!hideCloseButton && <DialogCloseButton data-dialog-x className={sheet ? "absolute right-4 top-7" : "absolute right-4 top-4 sm:right-6 sm:top-5"} />}
            {sheet ? <DialogPrimitive.Close ref={close} hidden tabIndex={-1} aria-hidden="true" /> : null}
        </>
    );
    return (
        <DialogPortal>
            <DialogOverlay />
            <DialogPrimitive.Content
                ref={ref}
                data-cadence-dialog-content="true"
                data-dialog-sheet={sheet || undefined}
                aria-describedby={undefined}
                asChild={sheet}
                className={cn(DIALOG_CONTENT, className, sheet && DIALOG_SHEET)}
                {...props}
            >
                {sheet ? (
                    <motion.div
                        drag="y"
                        dragListener={false}
                        dragControls={dragControls}
                        dragConstraints={{ top: 0, bottom: 0 }}
                        dragElastic={{ top: 0, bottom: 0.6 }}
                        onDragEnd={(_, info) => {
                            if (info.offset.y > SWIPE_THRESHOLD || info.velocity.y > 300) close.current?.click();
                        }}
                    >
                        {content}
                    </motion.div>
                ) : content}
            </DialogPrimitive.Content>
        </DialogPortal>
    );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        data-dialog-header
        className={cn(DIALOG_HEADER, "text-left", className)}
        {...props}
    />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        data-dialog-footer
        className={cn(DIALOG_FOOTER, className)}
        {...props}
    />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Title>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Title
        ref={ref}
        className={cn(DIALOG_TITLE, className)}
        {...props}
    />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Description
        ref={ref}
        className={cn(DIALOG_DESCRIPTION, className)}
        {...props}
    />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
    Dialog,
    DialogCloseButton,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
};
