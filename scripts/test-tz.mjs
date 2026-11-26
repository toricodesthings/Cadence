import { spawnSync } from "node:child_process";

const ZONES = ["America/Toronto", "America/Los_Angeles", "Pacific/Kiritimati", "Pacific/Pago_Pago"];
const zones = process.argv.length > 2 ? process.argv.slice(2) : ZONES;

let failed = false;
for (const TZ of zones) {
    console.log(`\n── TZ=${TZ} ──`);
    const run = spawnSync("npx", ["vitest", "run"], { stdio: "inherit", env: { ...process.env, TZ } });
    if (run.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
