import * as React from "react"
import { cn } from "../../lib/utils"

export interface InputProps
    extends React.InputHTMLAttributes<HTMLInputElement> {
    icon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, icon, ...props }, ref) => {
        return (
            <div className="relative flex items-center w-full">
                {icon && (
                    <div className="absolute left-3 flex items-center justify-center text-twilight-text-muted pointer-events-none">
                        {icon}
                    </div>
                )}
                <input
                    type={type}
                    className={cn(
                        "flex h-11 w-full rounded-xl border border-twilight-border-light bg-white/[0.05] px-3 py-2 text-sm text-twilight-text shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-twilight-text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lantern/40 focus-visible:border-lantern/40 disabled:cursor-not-allowed disabled:opacity-50",
                        icon ? "pl-10" : "",
                        className
                    )}
                    ref={ref}
                    {...props}
                />
            </div>
        )
    }
)
Input.displayName = "Input"

export { Input }
