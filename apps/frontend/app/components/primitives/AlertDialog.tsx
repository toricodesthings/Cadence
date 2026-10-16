"use client";

import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { cn } from "../../lib/utils";
import { DIALOG_CONTENT, DIALOG_DESCRIPTION, DIALOG_FOOTER, DIALOG_HEADER, DIALOG_OVERLAY, DIALOG_TITLE } from "./dialog-styles";

const Root = AlertDialogPrimitive.Root;
const Trigger = AlertDialogPrimitive.Trigger;
const Portal = AlertDialogPrimitive.Portal;

const Cancel = ({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) => (
    <AlertDialogPrimitive.Cancel
        className={cn("cursor-pointer", className)}
        {...props}
    />
);

const Action = ({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Action>) => (
    <AlertDialogPrimitive.Action
        className={cn("cursor-pointer", className)}
        {...props}
    />
);

const Overlay = ({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) => (
    <AlertDialogPrimitive.Overlay
        className={cn(DIALOG_OVERLAY, className)}
        {...props}
    />
);

const Content = ({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Content>) => (
    <Portal>
        <Overlay />
        <AlertDialogPrimitive.Content
            className={cn(DIALOG_CONTENT, "sm:max-w-md", className)}
            {...props}
        />
    </Portal>
);

const Header = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn(DIALOG_HEADER, className)} {...props} />
);

const Footer = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn(DIALOG_FOOTER, className)} {...props} />
);

const Title = ({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Title>) => (
    <AlertDialogPrimitive.Title
        className={cn(DIALOG_TITLE, className)}
        {...props}
    />
);

const Description = ({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Description>) => (
    <AlertDialogPrimitive.Description
        className={cn(DIALOG_DESCRIPTION, className)}
        {...props}
    />
);

export {
    Root,
    Trigger,
    Content,
    Header,
    Footer,
    Title,
    Description,
    Cancel,
    Action,
};
