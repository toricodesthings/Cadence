import { Fragment, useEffect, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { CalendarHeart, Flame, FolderOpen, LoaderCircle, Link2Off, Users, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import type { EventInvitePreview, ListInvitePreview, RoutineInvitePreview } from "@cadence/contracts/sharing";
import { RoutineMark } from "../components/habits/RoutineMark";
import { Button } from "../components/primitives/Button";
import { CardPage, rise, stagger } from "../components/shared/CardPage";
import { Loading } from "../components/shared/Loading";
import { AvatarFace } from "../components/sharing/PersonAvatar";
import { EmptyState } from "../components/tasks/EmptyState";
import { useAuthState } from "../hooks/auth/use-auth-state";
import { usePersonalEvents } from "../hooks/calendar/use-personal-events";
import { useDocumentTitle } from "../hooks/core/use-document-title";
import { useAllHabits } from "../hooks/habits/use-habits";
import { useProjects } from "../hooks/projects/use-projects";
import { useInvitePreview, useJoinInvite } from "../hooks/sharing/use-share-list";
import { toastError } from "../lib/utils/error-toast";
import { resolveAccentColor } from "../lib/utils/color-resolver";
import { eventToneColor } from "../lib/utils/personal-events";
import { useToday } from "../lib/utils/user-zone";

const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

function formatEveryMonthDay(monthDay: string): string {
    const [mm, dd] = monthDay.split("-").map(Number);
    const month = MONTH_NAMES[(mm ?? 1) - 1] ?? "";
    return `Every ${month} ${dd}`;
}

type AcceptCardProps = {
    hero: ReactNode;
    glowColor: string;
    title: string;
    details?: { icon: LucideIcon; lines: string[] };
    fromLine: string;
    ownerName: string | null;
    ownerImage: string | null;
    privacyLine: string;
    primaryLabel: string;
    pendingLabel: string;
    isPending: boolean;
    onDecline: () => void;
    onAccept: () => void;
};

export function AcceptCard({
    hero,
    glowColor,
    title,
    details,
    fromLine,
    ownerName,
    ownerImage,
    privacyLine,
    primaryLabel,
    pendingLabel,
    isPending,
    onDecline,
    onAccept,
}: AcceptCardProps) {
    const DetailIcon = details?.icon;
    return (
        <CardPage>
            <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col items-center">
                <motion.p
                    variants={rise}
                    className="inline-flex max-w-full items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm text-twilight-text-soft surface-control"
                >
                    <AvatarFace person={{ name: ownerName, image: ownerImage }} size={24} />
                    <span className="min-w-0 truncate">{fromLine}</span>
                </motion.p>
                <motion.header variants={rise} className="mt-5 flex w-full flex-col items-center text-center">
                    <div
                        aria-hidden="true"
                        className="grid size-28 place-items-center rounded-full text-[4.5rem] leading-none"
                        style={{
                            color: glowColor,
                            background: `radial-gradient(circle, color-mix(in srgb, ${glowColor} 24%, transparent) 0%, transparent 72%)`,
                        }}
                    >
                        {hero}
                    </div>
                    <h1 className="mt-3 max-w-full font-display text-[1.6rem] font-semibold leading-tight tracking-tight text-twilight-text text-balance">
                        {title}
                    </h1>
                    {details && DetailIcon ? (
                        <p className="mt-2 inline-flex flex-wrap items-center justify-center gap-x-1.5 text-sm text-twilight-text-soft">
                            <DetailIcon size={15} className="shrink-0" aria-hidden="true" />
                            {details.lines.map((line, i) => (
                                <Fragment key={line}>
                                    {i > 0 ? <span aria-hidden="true">·</span> : null}
                                    <span>{line}</span>
                                </Fragment>
                            ))}
                        </p>
                    ) : null}
                </motion.header>
                <motion.div variants={rise} className="mt-8 flex w-full flex-col gap-3">
                    <p className="text-center text-xs leading-5 text-twilight-text-soft text-pretty">
                        <Users size={13} className="mr-1.5 inline -mt-0.5" aria-hidden="true" />
                        {privacyLine}
                    </p>
                    <div className="flex gap-3">
                        <Button
                            variant="secondary"
                            size="md"
                            className="flex-1"
                            disabled={isPending}
                            onClick={onDecline}
                        >
                            Not now
                        </Button>
                        <Button size="md" className="flex-1" disabled={isPending} onClick={onAccept}>
                            {isPending ? (
                                <LoaderCircle size={16} className="animate-spin" aria-label={pendingLabel} />
                            ) : (
                                primaryLabel
                            )}
                        </Button>
                    </div>
                </motion.div>
            </motion.div>
        </CardPage>
    );
}

function JoinList({
    preview,
    isPending,
    onDecline,
    onAccept,
}: {
    preview: ListInvitePreview;
    isPending: boolean;
    onDecline: () => void;
    onAccept: () => void;
}) {
    const { name, emoji, colorAccent, ownerName, ownerImage } = preview;
    return (
        <AcceptCard
            hero={emoji || <FolderOpen size={64} strokeWidth={1.5} />}
            glowColor={resolveAccentColor(colorAccent) ?? "var(--accent-primary)"}
            title={name}
            fromLine={`Shared by ${ownerName ?? "someone"}`}
            ownerName={ownerName}
            ownerImage={ownerImage}
            privacyLine="Joining shows you this list. People in it will see your name, picture and pronouns."
            primaryLabel="Join list"
            pendingLabel="Joining"
            isPending={isPending}
            onDecline={onDecline}
            onAccept={onAccept}
        />
    );
}

function AcceptEvent({
    preview,
    isPending,
    onDecline,
    onAccept,
}: {
    preview: EventInvitePreview;
    isPending: boolean;
    onDecline: () => void;
    onAccept: () => void;
}) {
    const owner = preview.ownerName ?? "Someone";
    const lines = [formatEveryMonthDay(preview.monthDay)];
    if (preview.startedOn) lines.push(`Since ${preview.startedOn.slice(0, 4)}`);
    const glowColor = eventToneColor(preview.color) ?? "var(--accent-nav-schedule)";

    return (
        <AcceptCard
            hero={preview.emoji || "🎉"}
            glowColor={glowColor}
            title={preview.label}
            details={{ icon: CalendarHeart, lines }}
            fromLine={`${owner} is sharing this date with you`}
            ownerName={preview.ownerName}
            ownerImage={preview.ownerImage}
            privacyLine={`${preview.ownerName ?? "They"} will see your name, picture and pronouns.`}
            primaryLabel="Add to my events"
            pendingLabel="Adding"
            isPending={isPending}
            onDecline={onDecline}
            onAccept={onAccept}
        />
    );
}

function formatRoutineCadence(rule: string, targetTime: string | null, times: string[] | null): string {
    const base = rule.includes("BYDAY=MO,TU,WE,TH,FR")
        ? "Every weekday"
        : rule.includes("INTERVAL=")
          ? `Every ${rule.match(/INTERVAL=(\d+)/)?.[1] ?? "few"} days`
          : rule.includes("FREQ=WEEKLY")
            ? "Every week"
            : "Every day";
    if (times && times.length > 0) return `${base} at ${times.join(", ")}`;
    if (targetTime) return `${base} at ${targetTime}`;
    return base;
}

function AcceptRoutine({
    preview,
    isPending,
    onDecline,
    onAccept,
}: {
    preview: RoutineInvitePreview;
    isPending: boolean;
    onDecline: () => void;
    onAccept: () => void;
}) {
    const owner = preview.ownerName ?? "Someone";
    const otherNames = preview.people.map((p) => p.name).filter((n): n is string => Boolean(n));
    const withNames = [owner, ...otherNames].join(" and ");
    const fromLine =
        preview.way === "cheering"
            ? `Cheer ${owner} on`
            : preview.way === "turns"
              ? `Take turns with ${withNames}`
              : `Do it together with ${owner}`;
    const privacyLine =
        preview.way === "cheering"
            ? `You'll see the days ${owner} does it. ${owner} will see your name, picture and pronouns.`
            : `${owner} will see when you check it off, plus your name, picture and pronouns.`;
    const primaryLabel = preview.way === "cheering" ? "Start cheering" : "Add to my routines";
    const glowColor = resolveAccentColor(preview.colorAccent) ?? "var(--accent-primary)";

    return (
        <AcceptCard
            hero={<RoutineMark emoji={preview.emoji} size={64} />}
            glowColor={glowColor}
            title={preview.title}
            details={{
                icon: Flame,
                lines: [formatRoutineCadence(preview.recurrenceRule, preview.targetTime, preview.times)],
            }}
            fromLine={fromLine}
            ownerName={preview.ownerName}
            ownerImage={preview.ownerImage}
            privacyLine={privacyLine}
            primaryLabel={primaryLabel}
            pendingLabel="Adding"
            isPending={isPending}
            onDecline={onDecline}
            onAccept={onAccept}
        />
    );
}

export default function JoinRoute() {
    const { token } = useParams();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { authReady, isAuthenticated, session } = useAuthState();
    const preview = useInvitePreview(token);
    const { data: projects } = useProjects();
    const today = useToday();
    const { items: events } = usePersonalEvents(Number(today.slice(0, 4)));
    const { data: habits } = useAllHabits();
    const join = useJoinInvite();

    const data = preview.data;
    const kind = data?.kind;
    useDocumentTitle(
        kind === "event"
            ? "A shared date · Cadence"
            : kind === "routine"
              ? "A shared routine · Cadence"
              : "Join a list · Cadence",
    );

    useEffect(() => {
        if (authReady && !isAuthenticated) {
            navigate(`/auth/sign-up?redirectTo=${encodeURIComponent(pathname)}`, { replace: true });
        }
    }, [authReady, isAuthenticated, navigate, pathname]);

    const alreadyListId = data?.kind === "list" && projects?.some((p) => p.id === data.listId) ? data.listId : null;
    const alreadyEvent =
        data?.kind === "event" && (data.ownerId === session?.user.id || events.some((e) => e.id === data.eventId));
    const alreadyRoutine =
        data?.kind === "routine" && (data.ownerId === session?.user.id || habits?.some((h) => h.id === data.routineId));

    useEffect(() => {
        if (alreadyListId) navigate(`/project/${alreadyListId}`, { replace: true });
        else if (alreadyEvent) navigate("/events", { replace: true });
        else if (alreadyRoutine) navigate("/routines", { replace: true });
    }, [alreadyListId, alreadyEvent, alreadyRoutine, navigate]);

    if (!authReady || !isAuthenticated || preview.isPending || alreadyListId || alreadyEvent || alreadyRoutine) {
        return <Loading />;
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

    const accept = () =>
        join.mutate(token!, {
            onSuccess: (joined) => {
                if (joined.kind === "list") navigate(`/project/${joined.listId}`, { replace: true });
                else if (joined.kind === "event") navigate("/events", { replace: true });
                else navigate("/routines", { replace: true });
            },
            onError: (err) =>
                toastError(
                    err,
                    preview.data.kind === "event"
                        ? "Couldn't add this date"
                        : preview.data.kind === "routine"
                          ? "Couldn't add this routine"
                          : "Couldn't join the list",
                ),
        });

    const common = { isPending: join.isPending, onDecline: () => navigate("/today"), onAccept: accept };
    if (preview.data.kind === "event") return <AcceptEvent preview={preview.data} {...common} />;
    if (preview.data.kind === "routine") return <AcceptRoutine preview={preview.data} {...common} />;
    return <JoinList preview={preview.data} {...common} />;
}
