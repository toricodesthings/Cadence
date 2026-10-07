import { BellRing } from "lucide-react";
import { Button } from "../primitives/Button";
import { SettingsRow } from "../settings/layout/SettingsLayout";
import { useDeviceDelivery } from "../../hooks/notifications/use-device-delivery";
import type { DeviceStatus } from "../../lib/notifications/device-delivery";

const STATUS_COPY: Record<DeviceStatus, (desktop: boolean) => string> = {
    off: (desktop) => `Get reminders on this ${desktop ? "computer" : "device"}.`,
    connected: () => "Reminders reach this device even when Cadence is closed.",
    local: (desktop) => `Reminders appear while Cadence is ${desktop ? "running" : "open"}.`,
    denied: () => "Blocked by your browser. Allow notifications for this site in the address bar or browser settings, then check again.",
    install: () => "On iPhone or iPad, tap Share, then Add to Home Screen, and open Cadence from its icon.",
    unsupported: () => "This browser can't show notifications.",
};

const MISSING_HELP = "Check that notifications are allowed for Cadence in your device settings and that Focus or Do Not Disturb is off. Then send another test.";

/** What happened to the last test, in words, with the two answers that tell us if it truly arrived. */
function TestFeedback() {
    const { test, confirmTest, error } = useDeviceDelivery();
    return <div aria-live="polite" className="text-sm text-twilight-text-soft">
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

/** Notifications on this device: the one place to enable, test and turn off delivery. */
export function DeviceDeliveryRow() {
    const { status, desktop, busy, test, enable, disable, recheck, runTest } = useDeviceDelivery();
    const on = status === "connected" || status === "local";
    return <>
        <SettingsRow title={desktop ? "Notifications on this computer" : "Notifications on this device"} description={STATUS_COPY[status](desktop)}>
            <div className="flex flex-wrap gap-2 sm:justify-end">
                {status === "off" && <Button variant="primary" size="sm" disabled={busy} onClick={() => void enable()}>Enable notifications</Button>}
                {status === "denied" && <Button variant="secondary" size="sm" onClick={() => void recheck()}>Check again</Button>}
                {on && <>
                    <Button variant="secondary" size="sm" disabled={test === "sending"} onClick={() => void runTest()}>Send a test</Button>
                    <Button variant="ghost" size="sm" onClick={() => void disable()}>Turn off</Button>
                </>}
            </div>
        </SettingsRow>
        <TestFeedback />
    </>;
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
