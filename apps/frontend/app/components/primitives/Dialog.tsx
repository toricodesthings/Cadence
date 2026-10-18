"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useFocusScopeBranch } from "@radix-ui/react-focus-scope";
import { X } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useKeyboardInset } from "../../hooks/ui/use-keyboard-inset";
import { useSheetGesture } from "../../hooks/ui/use-sheet-gesture";
import { DIALOG_CONTENT, DIALOG_DESCRIPTION, DIALOG_FOOTER, DIALOG_HEADER, DIALOG_OVERLAY, DIALOG_SHEET, DIALOG_TITLE } from "./dialog-styles";

const Dialog = DialogPrimitive.Root;

/**
 * The toaster lives outside any dialog, so a trapped focus scope would pull focus back out of it.
 * Registering it as a branch keeps an Undo toast reachable by keyboard while a dialog or sheet is open.
 */
function ToasterFocusBranch() {
    const [toaster, setToaster] = React.useState<HTMLElement | null>(null);
    React.useEffect(() => setToaster(document.querySelector<HTMLElement>("[data-cadence-toaster]")), []);
    useFocusScopeBranch(toaster);
    return null;
}

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = ({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) => (
    <DialogPrimitive.Overlay
        className={cn(DIALOG_OVERLAY, className)}
        {...props}
    />
);

/** The dialog's X button; use it directly when a layout places close inside its own header. */
const DialogCloseButton = ({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) => (
    <DialogPrimitive.Close
        className={cn("btn-icon shrink-0 cursor-pointer text-twilight-text-muted opacity-70 transition-[opacity,background-color] duration-150 hover:bg-white/[0.06] hover:text-twilight-text hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 disabled:pointer-events-none", className)}
        {...props}
    >
        <X className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">Close</span>
    </DialogPrimitive.Close>
);

const DialogContent = ({ className, children, hideCloseButton, phoneSheet = true, ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & {
    hideCloseButton?: boolean;
    /** False for a surface that is full screen at every size (the photo viewer). */
    phoneSheet?: boolean;
}) => {
    // A touch phone gets a docked sheet: pull it down from anywhere to dismiss, as every compact sheet does.
    const { isPhone, isTouch } = useShellMode();
    const sheet = phoneSheet && isPhone && isTouch;
    const close = React.useRef<HTMLButtonElement>(null);
    const [sheetEl, setSheetEl] = React.useState<HTMLElement | null>(null);
    // A throw closes through Radix (onOpenChange); the CSS slide-out adds to the drag, so it leaves from the finger.
    const { y, backdropOpacity } = useSheetGesture({ element: sheetEl, enabled: sheet, onDismiss: () => close.current?.click() });
    // Like every sheet, it rides the keyboard instead of hiding its fields and buttons under it.
    const { inset: keyboard } = useKeyboardInset(sheet);
    const content = (
        <>
            {sheet ? (
                <div className="absolute inset-x-0 top-0 flex h-8 items-center justify-center" aria-hidden="true">
                    <div className="h-1 w-10 rounded-full bg-twilight-text-muted/40" />
                </div>
            ) : null}
            {children}
            <ToasterFocusBranch />
            {!hideCloseButton && <DialogCloseButton data-dialog-x className={sheet ? "absolute right-4 top-7" : "absolute right-4 top-4 sm:right-6 sm:top-5"} />}
            {sheet ? <DialogPrimitive.Close ref={close} hidden tabIndex={-1} aria-hidden="true" /> : null}
        </>
    );
    return (
        <DialogPortal>
            {sheet ? (
                <DialogPrimitive.Overlay asChild>
                    <motion.div style={{ opacity: backdropOpacity }} className={DIALOG_OVERLAY} />
                </DialogPrimitive.Overlay>
            ) : <DialogOverlay />}
            <DialogPrimitive.Content
                data-cadence-dialog-content="true"
                data-dialog-sheet={sheet || undefined}
                aria-describedby={undefined}
                asChild={sheet}
                className={cn(DIALOG_CONTENT, className, sheet && DIALOG_SHEET)}
                {...props}
            >
                {sheet ? (
                    <motion.div
                        ref={setSheetEl}
                        style={{ y, ...(keyboard ? { bottom: keyboard, maxHeight: `calc(100dvh - ${keyboard}px - max(0.5rem, env(safe-area-inset-top)))`, paddingBottom: "1rem" } : {}) }}
                    >
                        {content}
                    </motion.div>
                ) : content}
            </DialogPrimitive.Content>
        </DialogPortal>
    );
};

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

const DialogTitle = ({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) => (
    <DialogPrimitive.Title
        className={cn(DIALOG_TITLE, className)}
        {...props}
    />
);

const DialogDescription = ({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) => (
    <DialogPrimitive.Description
        className={cn(DIALOG_DESCRIPTION, className)}
        {...props}
    />
);

export {
    Dialog,
    ToasterFocusBranch,
    DialogCloseButton,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
};
