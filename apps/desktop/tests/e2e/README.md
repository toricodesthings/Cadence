# Desktop Smoke Tests

The smoke suite uses the official Tauri WebDriver flow with `tauri-driver` and `selenium-webdriver`.

Prerequisites:

- Rust installed with `cargo install tauri-driver --locked`
- Linux desktop dependencies installed when running on Linux

Run locally from the repo root:

```bash
pnpm --filter @cadence/desktop e2e:smoke
```
