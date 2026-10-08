#[cfg(desktop)]
use tauri::{
    menu::{MenuBuilder, SubmenuBuilder},
    AppHandle, Emitter, Manager, Runtime,
};
#[cfg(any(windows, target_os = "linux"))]
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg(desktop)]
const MAIN_WINDOW_LABEL: &str = "main";
#[cfg(desktop)]
const QUICK_CAPTURE_COMMAND_EVENT: &str = "cadence://desktop-command";

#[cfg(desktop)]
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SingleInstancePayload {
    args: Vec<String>,
    cwd: String,
}

#[cfg(desktop)]
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopCommandPayload {
    command: String,
    value: Option<String>,
}

#[cfg(desktop)]
fn focus_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(desktop)]
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

#[cfg(desktop)]
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
        .text("navigate.habits", "Routines")
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

/// Windows Efficiency mode: while Cadence is in the background, mark the host process as EcoQoS
/// and ask WebView2 to use less memory; undo both on focus.
#[cfg(windows)]
mod efficiency {
    use tauri::{Runtime, WebviewWindow};
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
    };
    use windows_core::Interface;
    use windows_sys::Win32::System::Threading::{
        GetCurrentProcess, ProcessPowerThrottling, SetProcessInformation,
        PROCESS_POWER_THROTTLING_CURRENT_VERSION, PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
        PROCESS_POWER_THROTTLING_STATE,
    };

    pub fn set<R: Runtime>(window: &WebviewWindow<R>, on: bool) {
        let state = PROCESS_POWER_THROTTLING_STATE {
            Version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
            ControlMask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
            StateMask: if on {
                PROCESS_POWER_THROTTLING_EXECUTION_SPEED
            } else {
                0
            },
        };
        // Best effort: older Windows builds reject it, and nothing depends on it.
        unsafe {
            SetProcessInformation(
                GetCurrentProcess(),
                ProcessPowerThrottling,
                &state as *const _ as *const _,
                std::mem::size_of::<PROCESS_POWER_THROTTLING_STATE>() as u32,
            );
        }
        let _ = window.with_webview(move |webview| unsafe {
            if let Ok(core) = webview.controller().CoreWebView2() {
                if let Ok(core) = core.cast::<ICoreWebView2_19>() {
                    let _ = core.SetMemoryUsageTargetLevel(if on {
                        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
                    } else {
                        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
                    });
                }
            }
        });
    }
}

/// Windows only: lets Cadence keep running (and delivering reminders) after the main window
/// closes, with a tray icon as the only way back. Opt-in, read once at startup from the same
/// preference store the frontend writes — enabling it from Settings takes effect on next launch,
/// never retroactively, so a tray never silently appears without a way back.
#[cfg(windows)]
mod background {
    use super::focus_main_window;
    use std::sync::Mutex;
    use tauri::{
        menu::MenuBuilder,
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
        App, Manager,
    };
    use tauri_plugin_store::StoreExt;

    const PREFERENCES_STORE: &str = "cadence_desktop_preferences.dat";
    const BACKGROUND_KEY: &str = "backgroundDelivery";

    /// Whether this session's main window should hide instead of quitting on close.
    pub struct BackgroundActive(pub Mutex<bool>);

    fn requested_at_startup(app: &App) -> bool {
        app.store(PREFERENCES_STORE)
            .ok()
            .and_then(|store| store.get(BACKGROUND_KEY))
            .and_then(|value| value.as_bool())
            .unwrap_or(false)
    }

    /// Builds the tray icon only when the person already opted in before this launch. Managing
    /// `BackgroundActive(false)` either way keeps the window-close handler infallible to call.
    pub fn setup(app: &App) -> tauri::Result<()> {
        let active = requested_at_startup(app);
        app.manage(BackgroundActive(Mutex::new(active)));

        if !active {
            return Ok(());
        }

        let menu = MenuBuilder::new(app)
            .text("tray.open", "Open Cadence")
            .separator()
            .text("tray.quit", "Quit Cadence")
            .build()?;

        let mut builder = TrayIconBuilder::new()
            .menu(&menu)
            .tooltip("Cadence")
            .show_menu_on_left_click(false)
            .on_menu_event(|app, event| match event.id().0.as_str() {
                "tray.open" => focus_main_window(app),
                "tray.quit" => app.exit(0),
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    focus_main_window(&tray.app_handle());
                }
            });

        if let Some(icon) = app.default_window_icon() {
            builder = builder.icon(icon.clone());
        }

        builder.build(app)?;
        Ok(())
    }

    /// Called from the main window's close handler: true means hide instead of quitting.
    pub fn should_hide_on_close<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> bool {
        app.state::<BackgroundActive>()
            .0
            .lock()
            .map(|guard| *guard)
            .unwrap_or(false)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Desktop-only plugins: none of these have an Android/iOS implementation.
    // single-instance must stay the first plugin registered.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let _ = app.emit("single-instance", SingleInstancePayload { args: argv, cwd });
            focus_main_window(app);
        }))
        .plugin(tauri_plugin_keyring::init())
        .plugin(tauri_plugin_oauth::init());

    // Windows only: relaunches Cadence on login so background delivery survives a restart.
    #[cfg(windows)]
    let builder = builder.plugin(tauri_plugin_autostart::Builder::new().build());

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .on_window_event(|window, event| {
            #[cfg(windows)]
            if window.label() == MAIN_WINDOW_LABEL {
                match event {
                    tauri::WindowEvent::Focused(focused) => {
                        if let Some(w) = window.app_handle().get_webview_window(MAIN_WINDOW_LABEL) {
                            efficiency::set(&w, !*focused);
                        }
                    }
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        if background::should_hide_on_close(window.app_handle()) {
                            api.prevent_close();
                            let _ = window.hide();
                        }
                    }
                    _ => {}
                }
            }
            #[cfg(not(windows))]
            let _ = (window, event);
        })
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

            #[cfg(windows)]
            background::setup(app)?;

            #[cfg(desktop)]
            {
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

                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
