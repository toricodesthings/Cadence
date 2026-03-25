use tauri::{
    menu::{MenuBuilder, SubmenuBuilder},
    AppHandle, Emitter, Manager, Runtime,
};
#[cfg(any(windows, target_os = "linux"))]
use tauri_plugin_deep_link::DeepLinkExt;

const MAIN_WINDOW_LABEL: &str = "main";
const QUICK_CAPTURE_COMMAND_EVENT: &str = "cadence://desktop-command";

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SingleInstancePayload {
    args: Vec<String>,
    cwd: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopCommandPayload {
    command: String,
    value: Option<String>,
}

fn focus_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn emit_desktop_command<R: Runtime>(app: &AppHandle<R>, command: &str, value: Option<&str>) {
    let _ = app.emit_to(
        MAIN_WINDOW_LABEL,
        QUICK_CAPTURE_COMMAND_EVENT,
        DesktopCommandPayload {
            command: command.to_string(),
            value: value.map(str::to_string),
        },
    );
}

fn build_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    let file_menu = SubmenuBuilder::new(app, "File")
        .text("file.quick_capture", "Quick Capture")
        .text("file.settings", "Settings")
        .text("file.sync_now", "Sync Now")
        .text("file.check_updates", "Check for Updates")
        .separator()
        .text("file.quit", "Quit Cadence")
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .text("view.search", "Search")
        .text("view.command_palette", "Command Palette")
        .separator()
        .text("view.sync_inspector", "Sync Inspector")
        .separator()
        .text("view.zoom_in", "Increase Layout Scale")
        .text("view.zoom_out", "Decrease Layout Scale")
        .text("view.zoom_reset", "Reset Layout Scale")
        .build()?;

    let navigate_menu = SubmenuBuilder::new(app, "Navigate")
        .text("navigate.capture", "Capture")
        .text("navigate.schedule", "Schedule")
        .text("navigate.habits", "Habits")
        .text("navigate.weekly_review", "Weekly Review")
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .text("window.focus", "Bring Cadence to Front")
        .text("window.quick_capture", "Focus Quick Capture")
        .build()?;

    let help_menu = SubmenuBuilder::new(app, "Help")
        .text("help.shortcuts", "Keyboard Shortcuts")
        .text("help.about", "About Cadence")
        .text("help.feedback", "Help & Feedback")
        .build()?;

    MenuBuilder::new(app)
        .items(&[
            &file_menu,
            &edit_menu,
            &view_menu,
            &navigate_menu,
            &window_menu,
            &help_menu,
        ])
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let _ = app.emit("single-instance", SingleInstancePayload { args: argv, cwd });
            focus_main_window(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_keyring::init())
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            if cfg!(debug_assertions) {
                let _ = app.deep_link().register_all();
            }

            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(if cfg!(debug_assertions) {
                        log::LevelFilter::Info
                    } else {
                        log::LevelFilter::Warn
                    })
                    .build(),
            )?;

            app.handle()
                .plugin(tauri_plugin_global_shortcut::Builder::new().build())?;

            let menu = build_app_menu(app.handle())?;
            app.set_menu(menu)?;

            app.on_menu_event(move |app_handle, event| match event.id().0.as_str() {
                "file.quick_capture" | "window.quick_capture" => {
                    focus_main_window(app_handle);
                    emit_desktop_command(app_handle, "open-quick-capture", Some("task"));
                }
                "file.settings" => {
                    focus_main_window(app_handle);
                    emit_desktop_command(app_handle, "show-settings", Some("account"));
                }
                "file.sync_now" => {
                    focus_main_window(app_handle);
                    emit_desktop_command(app_handle, "sync-now", None);
                }
                "file.check_updates" => {
                    focus_main_window(app_handle);
                    emit_desktop_command(app_handle, "show-settings", Some("privacy"));
                }
                "file.quit" => app_handle.exit(0),
                "view.search" => {
                    focus_main_window(app_handle);
                    emit_desktop_command(app_handle, "show-search", None);
                }
                "view.command_palette" => {
                    focus_main_window(app_handle);
                    emit_desktop_command(app_handle, "show-command-palette", None);
                }
                "view.sync_inspector" => {
                    focus_main_window(app_handle);
                    emit_desktop_command(app_handle, "show-sync-inspector", None);
                }
                "view.zoom_in" => {
                    focus_main_window(app_handle);
                    emit_desktop_command(app_handle, "layout-scale-increase", None);
                }
                "view.zoom_out" => {
                    focus_main_window(app_handle);
                    emit_desktop_command(app_handle, "layout-scale-decrease", None);
                }
                "view.zoom_reset" => {
                    focus_main_window(app_handle);
                    emit_desktop_command(app_handle, "layout-scale-reset", None);
                }
                "navigate.capture" => {
                    focus_main_window(app_handle);
                    emit_desktop_command(app_handle, "navigate-capture", None);
                }
                "navigate.schedule" => {
                    focus_main_window(app_handle);
                    emit_desktop_command(app_handle, "navigate-schedule", None);
                }
                "navigate.habits" => {
                    focus_main_window(app_handle);
                    emit_desktop_command(app_handle, "navigate-habits", None);
                }
                "navigate.weekly_review" => {
                    focus_main_window(app_handle);
                    emit_desktop_command(app_handle, "navigate-weekly-review", None);
                }
                "window.focus" => {
                    focus_main_window(app_handle);
                }
                "help.shortcuts" => {
                    focus_main_window(app_handle);
                    emit_desktop_command(app_handle, "show-shortcuts", None);
                }
                "help.about" => {
                    focus_main_window(app_handle);
                    emit_desktop_command(app_handle, "show-settings", Some("about"));
                }
                "help.feedback" => {
                    focus_main_window(app_handle);
                    emit_desktop_command(app_handle, "show-settings", Some("about"));
                }
                _ => {}
            });

            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
