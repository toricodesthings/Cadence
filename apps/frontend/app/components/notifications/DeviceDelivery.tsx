import { BellRing, Laptop, Monitor, Smartphone, X } from "lucide-react";
import type { Device } from "@cadence/contracts/push";
import { Button } from "../primitives/Button";
import { Switch } from "../primitives";
import { Tip } from "../primitives/Tooltip";
import { SettingsSection, SettingsRow } from "../settings/layout/SettingsLayout";
import { useDeviceDelivery } from "../../hooks/notifications/use-device-delivery";
import { isBrave, type DeviceStatus } from "../../lib/notifications/device-delivery";
import { formatShortDateTime } from "../../lib/utils/date-format";

const STATUS_COPY: Record<DeviceStatus, (desktop: boolean) => string> = {
    off: (desktop) => `Get reminders on this ${desktop ? "computer" : "device"}.`,
    connected: () => "Reminders reach this device even when Cadence is closed.",
    local: (desktop) => `Reminders appear while Cadence is ${desktop ? "running" : "open"}.`,
    denied: () => "Blocked by your browser. Allow notifications for this site in the address bar or browser settings, then check again.",
    install: () => "On iPhone or iPad, tap Share, then Add to Home Screen, and open Cadence from its icon.",
    unsupported: () => "This browser can't show notifications.",
};

// The browser refused background push; say how to allow it instead of silently staying local.
const blockedPushCopy = () => isBrave()
    ? "Brave blocks background reminders by default. Turn on “Use Google services for push messaging” in brave://settings/privacy, restart Brave, then try again."
    : "This browser didn't allow background reminders, so they appear while Cadence is open. Check its notification settings, then try again.";

const MISSING_HELP = "Check that notifications are allowed for Cadence in your device settings and that Focus or Do Not Disturb is off. Then send another test.";

const DEVICE_ICON = { phone: Smartphone, computer: Monitor, "desktop-app": Laptop } as const;

/** What happened to the last test, in words, with the two answers that tell us if it truly arrived. */
function TestFeedback() {
    const { test, confirmTest, error } = useDeviceDelivery();
    return <div aria-live="polite" className="text-sm text-twilight-text-soft empty:hidden">
        {error && <p className="text-feedback-error">{error}</p>}
        {test === "sending" && <p>Sending a test…</p>}
        {test === "sent" && <div className="flex flex-wrap items-center gap-2">
            <p className="mr-1">Test sent. Did it arrive?</p>
            <Button variant="secondary" size="sm" onClick={() => confirmTest(true)}>I received it</Button>
            <Button variant="ghost" size="sm" onClick={() => confirmTest(false)}>Didn't arrive</Button>
        </div>}
        {test === "received" && <p>Great. Reminders will reach this device.</p>}
        {test === "missing" && <p>{MISSING_HELP}</p>}
        {test === "failed" && <p className="text-feedback-error">The test couldn't be sent. Check your connection and that notifications are allowed, then try again.</p>}
        {test === "gone" && <p className="text-feedback-error">This device was no longer registered. Turn notifications on again to reconnect it.</p>}
    </div>;
}

/**
 * The overlap Cadence can see but can't resolve on its own: the desktop app and a browser on the
 * same computer both alerting. It says so and offers the one-tap fix rather than guessing.
 */
function DuplicateHint() {
    const { duplicateHint, setEnabled, disable } = useDeviceDelivery();
    if (!duplicateHint) return null;
    const appAlso = duplicateHint.kind === "app-also";
    return <div className="mx-1 flex flex-wrap items-center gap-3 rounded-2xl bg-white/[0.03] px-4 py-3 text-sm text-twilight-text-soft">
        <p className="min-w-0 flex-1">
            {appAlso
                ? `“${duplicateHint.device.label}” also shows these, but only while it's running. If you see each reminder twice on one screen, turn it off.`
                : `“${duplicateHint.device.label}” already gets these, even when Cadence is closed. If you see each reminder twice on one screen, turn this one off.`}
        </p>
        <Button variant="secondary" size="sm" onClick={() => appAlso ? setEnabled(duplicateHint.device.installId, false) : void disable()}>
            {appAlso ? "Turn off the app" : "Turn off here"}
        </Button>
    </div>;
}

/** Notifications on this device: the one place to enable, test and turn off delivery. */
export function DeviceDeliveryRow() {
    const { status, desktop, busy, test, enable, disable, recheck, runTest, pushIssue } = useDeviceDelivery();
    const blocked = status === "local" && pushIssue === "blocked";
    const on = status === "connected" || status === "local";
    return <>
        <SettingsRow title={desktop ? "Notifications on this computer" : "Notifications on this device"} description={blocked ? blockedPushCopy() : STATUS_COPY[status](desktop)}>
            <div className="flex flex-wrap gap-2 sm:justify-end">
                {status === "off" && <Button variant="primary" disabled={busy} onClick={() => void enable()}>Enable notifications</Button>}
                {status === "denied" && <Button variant="secondary" onClick={() => void recheck()}>Check again</Button>}
                {blocked && <Button variant="secondary" disabled={busy} onClick={() => void enable()}>Try again</Button>}
                {on && <>
                    <Button variant="secondary" disabled={test === "sending"} onClick={() => void runTest()}>Send a test</Button>
                    <Button variant="ghost" onClick={() => void disable()}>Turn off</Button>
                </>}
            </div>
        </SettingsRow>
        <TestFeedback />
        <DuplicateHint />
    </>;
}

type DeviceActions = Pick<ReturnType<typeof useDeviceDelivery>, "setEnabled" | "forget">;

function DeviceLine({ device, isThis, setEnabled, forget }: { device: Device; isThis: boolean } & DeviceActions) {
    const Icon = DEVICE_ICON[device.kind] ?? Monitor;
    const reach = device.push ? "Reminders arrive even when closed" : "Reminders appear while Cadence is open";
    return <li className="flex items-center gap-3 rounded-[1.4rem] border border-white/[0.04] bg-white/[0.02] p-4">
        <Icon size={20} className="shrink-0 text-twilight-text-soft" aria-hidden="true" />
        <div className="min-w-0 flex-1">
            <p className="truncate text-base font-medium text-twilight-text">
                {device.label}{isThis && <span className="ml-2 text-xs font-normal text-accent-primary">This device</span>}
            </p>
            <p className="text-sm text-twilight-text-soft">
                {reach}{device.lastSeenAt && ` · last used ${formatShortDateTime(device.lastSeenAt)}`}
            </p>
        </div>
        <Switch checked={device.enabled} aria-label={`Reminders on ${device.label}`}
            onCheckedChange={(enabled) => setEnabled(device.installId, enabled)} />
        {!isThis && <Tip label={`Forget ${device.label}`}>
            <button type="button" aria-label={`Forget ${device.label}`} className="mobile-icon-button" onClick={() => forget(device.installId)}>
                <X size={16} aria-hidden="true" />
            </button>
        </Tip>}
    </li>;
}

/** Every device that can show this account's reminders, controllable from any one of them. */
export function DeviceList() {
    const { devices, thisInstallId, setEnabled, forget } = useDeviceDelivery();
    if (devices.length === 0) return null;
    return <SettingsSection title="Your devices">
        <p className="-mt-2 px-1 text-sm text-twilight-text-soft">
            Turn reminders off for any device from here. Forgetting one stops it until someone enables it there again.
        </p>
        <ul className="flex flex-col gap-3">
            {devices.map((device) => <DeviceLine key={device.installId} device={device} isThis={device.installId === thisInstallId} setEnabled={setEnabled} forget={forget} />)}
        </ul>
    </SettingsSection>;
}

/** The quiet offer at the top of the notification center: one tap to enable, or wave it away for good. */
export function DeviceOffer() {
    const { offerEnable, busy, enable, dismissOffer, desktop } = useDeviceDelivery();
    if (!offerEnable) return null;
    return <div className="mx-1 mb-2 flex shrink-0 flex-wrap items-center gap-3 rounded-2xl bg-accent-primary-dim px-4 py-3">
        <BellRing size={18} className="shrink-0 text-accent-primary" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-twilight-text">Get reminders on this {desktop ? "computer" : "device"}.</p>
        <Button variant="primary" size="sm" disabled={busy} onClick={() => void enable()}>Enable</Button>
        <Button variant="ghost" size="sm" onClick={dismissOffer}>Not now</Button>
    </div>;
}
