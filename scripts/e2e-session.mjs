import { existsSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const APP = process.env.E2E_APP_URL ?? "http://localhost:8788";
const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const CREDS = join(ROOT, "apps/frontend/e2e_credentials.md");
const PIN = "PLAYWRIGHT_MCP_USER_DATA_DIR";

function pinnedProfile() {
    try {
        return JSON.parse(readFileSync(join(ROOT, ".claude/settings.local.json"), "utf8")).env?.[PIN];
    } catch {
        return undefined;
    }
}

const derived = () =>
    join(
        process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
        "ms-playwright-mcp",
        `mcp-chrome-${createHash("sha256").update(ROOT).digest("hex").slice(0, 7)}`,
    );

const PROFILE = process.env[PIN] ?? pinnedProfile() ?? derived();
if (!process.env[PIN] && !pinnedProfile())
    console.warn(`${PIN} is not pinned in .claude/settings.local.json; guessing ${PROFILE}`);

function openProfiles() {
    const dirs = new Set();
    for (const pid of readdirSync("/proc").filter((name) => /^\d+$/.test(name))) {
        try {
            const args = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
            const dir = args.find((arg) => arg.startsWith("--user-data-dir="));
            if (dir?.includes("ms-playwright-mcp") || dir?.slice(16) === PROFILE) dirs.add(dir.slice(16));
        } catch {}
    }
    return dirs;
}

function profileLocked() {
    try {
        process.kill(Number(readlinkSync(join(PROFILE, "SingletonLock")).split("-").pop()), 0);
        return true;
    } catch {
        return false;
    }
}

const open = existsSync("/proc") ? openProfiles() : new Set();
const elsewhere = [...open].filter((dir) => dir !== PROFILE);
if (elsewhere.length) {
    console.error(
        `The plugin browser uses ${elsewhere.join(", ")}, not ${PROFILE}. Set ${PIN} to it in .claude/settings.local.json.`,
    );
    process.exit(1);
}
if (open.has(PROFILE) || profileLocked()) {
    console.error("The Playwright plugin browser is open. Call browser_close, then run pnpm e2e:login again.");
    process.exit(1);
}

const context = await chromium.launchPersistentContext(PROFILE, { channel: "chrome", headless: true });
try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`${APP}/auth/sign-in`);
    await page.waitForLoadState("networkidle");
    if (new URL(page.url()).pathname.startsWith("/auth")) {
        if (!existsSync(CREDS)) throw new Error("apps/frontend/e2e_credentials.md is missing");
        const text = readFileSync(CREDS, "utf8");
        const email = text.match(/E2E_EMAIL=(\S+)/)?.[1];
        const password = text.match(/E2E_PASSWORD=(\S+)/)?.[1];
        if (!email || !password) throw new Error("e2e_credentials.md needs E2E_EMAIL and E2E_PASSWORD");
        await page.getByLabel(/email/i).fill(email);
        await page
            .getByLabel(/password/i)
            .first()
            .fill(password);
        await page
            .getByRole("button", { name: /sign in/i })
            .last()
            .click();
        await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30_000 });
    }
    console.log(`Signed in (${page.url()}). The Playwright plugin browser opens signed in.`);
} finally {
    await context.close();
}
