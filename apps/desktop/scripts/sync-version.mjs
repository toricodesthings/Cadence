import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJsonPath = path.join(desktopRoot, "package.json");
const tauriConfigPath = path.join(desktopRoot, "src-tauri", "tauri.conf.json");
const cargoTomlPath = path.join(desktopRoot, "src-tauri", "Cargo.toml");

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const version = packageJson.version;

if (typeof version !== "string" || !version) {
  throw new Error("apps/desktop/package.json is missing a valid version.");
}

const tauriConfig = JSON.parse(await readFile(tauriConfigPath, "utf8"));
if (tauriConfig.version !== version) {
  tauriConfig.version = version;
  await writeFile(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);
}

const cargoToml = await readFile(cargoTomlPath, "utf8");
const cargoVersionPattern = /^version = "[^"]+"$/m;

if (!cargoVersionPattern.test(cargoToml)) {
  throw new Error("Could not find a package version in apps/desktop/src-tauri/Cargo.toml.");
}

const syncedCargoToml = cargoToml.replace(
  cargoVersionPattern,
  `version = "${version}"`,
);

if (syncedCargoToml !== cargoToml) {
  await writeFile(cargoTomlPath, syncedCargoToml);
}

process.stdout.write(`Synced desktop version ${version}\n`);
