import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { FolderOpen, LoaderCircle, Link2Off, Users } from "lucide-react";
import { motion } from "framer-motion";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { Button } from "../components/primitives/Button";
import { CardPage, rise, stagger } from "../components/shared/CardPage";
import { AvatarFace } from "../components/sharing/PersonAvatar";
import { EmptyState } from "../components/tasks/EmptyState";
import { useAuthState } from "../hooks/auth/use-auth-state";
import { useDocumentTitle } from "../hooks/core/use-document-title";
import { useProjects } from "../hooks/projects/use-projects";
import { useInvitePreview, useJoinList } from "../hooks/sharing/use-share-list";
import { toastError } from "../lib/utils/error-toast";
import { resolveAccentColor } from "../lib/utils/color-resolver";

/**
 * A list shared by link. Signed-out visitors sign in first and come back here. The preview comes before anything is
 * joined, and says who will see what: joining shows you the list, and the people in it see your name, picture and pronouns.
 */
export default function JoinRoute() {
    useDocumentTitle("Join a list · Cadence");
    const { token } = useParams();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { authReady, isAuthenticated } = useAuthState();
    const preview = useInvitePreview(token);
    const { data: projects } = useProjects();
    const join = useJoinList();

    useEffect(() => {
        if (authReady && !isAuthenticated) {
            navigate(`/auth/sign-in?redirectTo=${encodeURIComponent(pathname)}`, { replace: true });
        }
    }, [authReady, isAuthenticated, navigate, pathname]);

    // Already in the list (a member, or its owner): straight there.
    const listId = preview.data?.listId;
    const already = Boolean(listId && projects?.some((project) => project.id === listId));
    useEffect(() => {
        if (already && listId) navigate(`/project/${listId}`, { replace: true });
    }, [already, listId, navigate]);

    if (!authReady || !isAuthenticated || preview.isPending || already) {
        return (
            <CardPage>
                <div className="flex justify-center py-10">
                    <LoaderCircle className="animate-spin text-twilight-text-soft" aria-label="Loading" />
                </div>
            </CardPage>
        );
    }
    if (preview.isError || !preview.data) {
        return (
            <CardPage>
                <EmptyState
                    icon={Link2Off}
                    title="This link has expired or was reset."
                    description="Ask for a new one."
                    compact
                />
            </CardPage>
        );
    }

    const { name, emoji, colorAccent, ownerName, ownerImage } = preview.data;
    const joinNow = () =>
        join.mutate(token!, {
            onSuccess: (id) => navigate(`/project/${id}`, { replace: true }),
            onError: (err) => toastError(err, "Couldn't join the list"),
        });

    return (
        <CardPage>
            <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
                <motion.header variants={rise} className="flex flex-col items-center gap-3 text-center">
                    <h1 className="flex max-w-full items-center justify-center gap-2.5 font-display text-[1.6rem] font-semibold leading-tight tracking-tight text-twilight-text">
                        <span className="shrink-0 text-[1.45rem] leading-none" aria-hidden="true">
                            {emoji || <FolderOpen size={22} style={{ color: resolveAccentColor(colorAccent) }} />}
                        </span>
                        <span className="min-w-0 text-balance">{name}</span>
                    </h1>
                    <p className="inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm text-twilight-text-soft surface-control">
                        <AvatarFace person={{ name: ownerName, image: ownerImage }} size={24} />
                        <span>Shared by {ownerName ?? "someone"}</span>
                    </p>
                </motion.header>
                <motion.p
                    variants={rise}
                    className="mx-auto flex max-w-xs items-start gap-2 text-left text-[0.8125rem] leading-5 text-twilight-text-soft text-pretty"
                >
                    <Users size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>Joining shows you this list. People in it will see your name, picture and pronouns.</span>
                </motion.p>
                <motion.div variants={rise} className="flex gap-3">
                    <Button
                        variant="secondary"
                        size="md"
                        className="flex-1"
                        disabled={join.isPending}
                        onClick={() => navigate("/today")}
                    >
                        Not now
                    </Button>
                    <Button size="md" className="flex-1" disabled={join.isPending} onClick={joinNow}>
                        {join.isPending ? (
                            <LoaderCircle size={16} className="animate-spin" aria-label="Joining" />
                        ) : (
                            "Join list"
                        )}
                    </Button>
                </motion.div>
            </motion.div>
        </CardPage>
    );
}
