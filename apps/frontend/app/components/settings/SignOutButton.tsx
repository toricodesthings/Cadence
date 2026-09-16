import { useState } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { useAuthState } from "../../hooks/auth/use-auth-state";

export function SignOutButton() {
    const { completeSignOut } = useAuthState();
    const [pending, setPending] = useState(false);
    return <button type="button" disabled={pending} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl border border-twilight-border px-4 py-3 text-feedback-error transition-colors hover:bg-twilight-surface disabled:opacity-60"
        onClick={async () => {
            setPending(true);
            try { await completeSignOut(); }
            catch (error) { toast.error(error instanceof Error ? error.message : "Couldn’t sign out right now."); }
            finally { setPending(false); }
        }}><LogOut size={20} aria-hidden="true" />{pending ? "Signing out…" : "Sign out"}</button>;
}
