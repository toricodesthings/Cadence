/** Shared by Dialog and AlertDialog so both render the same surface, layout and type. */
export const DIALOG_OVERLAY =
    "layer-system-dialog fixed inset-0 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0";

export const DIALOG_CONTENT =
    "surface-dialog layer-system-dialog fixed inset-x-4 bottom-4 grid max-h-[calc(100dvh-2rem)] w-auto gap-4 overflow-y-auto rounded-[28px] p-6 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.96] data-[state=open]:zoom-in-[0.96] sm:left-[50%] sm:top-[50%] sm:bottom-auto sm:w-full sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%]";

export const DIALOG_HEADER = "flex flex-col gap-1.5 text-center sm:text-left";
export const DIALOG_FOOTER = "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";
export const DIALOG_TITLE = "text-lg font-semibold leading-tight tracking-tight text-twilight-text";
export const DIALOG_DESCRIPTION = "text-sm leading-relaxed text-twilight-text-muted";
