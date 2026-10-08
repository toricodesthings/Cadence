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

/// Launch flags from the taskbar Jump List, mapped to the desktop command they stand for.
/// Allowlisted: any other argument is ignored.
fn launch_command(args: &[String]) -> Option<DesktopCommandPayload> {
    args.iter().find_map(|arg| {
        let (command, value) = match arg.as_str() {
            "--quick-capture" => ("open-quick-capture", Some("task")),
            "--schedule" => ("navigate-schedule", None),
            _ => return None,
        };
        Some(DesktopCommandPayload {
            command: command.into(),
            value: value.map(str::to_string),
        })
    })
}

/// A cold launch's command waits here until the main window's listener is ready to take it, once.
#[derive(Default)]
struct PendingLaunch(std::sync::Mutex<Option<DesktopCommandPayload>>);

#[tauri::command]
fn take_launch_command(state: tauri::State<PendingLaunch>) -> Option<DesktopCommandPayload> {
    state.0.lock().ok()?.take()
}

/// Native Save As for an export. Rust owns the dialog and the write, so the webview never gets a
/// path or general file access. Resolves false when the person cancels.
#[tauri::command]
async fn save_text_as(
    app: tauri::AppHandle,
    file_name: String,
    contents: String,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(path) = app
        .dialog()
        .file()
        .set_file_name(&file_name)
        .add_filter("Markdown", &["md"])
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(path, contents).map_err(|e| e.to_string())?;
    Ok(true)
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

/// Windows taskbar Jump List: two private tasks that relaunch Cadence with a flag. The running
/// instance receives it through single-instance; a cold start queues it in `PendingLaunch`.
#[cfg(windows)]
mod jump_list {
    use windows::core::{Interface, Result, HSTRING, PCWSTR};
    use windows::Win32::Storage::EnhancedStorage::PKEY_Title;
    use windows::Win32::System::Com::StructuredStorage::{
        PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::System::Variant::VT_LPWSTR;
    use windows::Win32::UI::Shell::Common::{IObjectArray, IObjectCollection};
    use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
    use windows::Win32::UI::Shell::{
        DestinationList, EnumerableObjectCollection, ICustomDestinationList, IShellLinkW,
        SHStrDupW, ShellLink,
    };

    const TASKS: [(&str, &str); 2] = [
        ("Quick Capture", "--quick-capture"),
        ("Open Schedule", "--schedule"),
    ];

    unsafe fn task(exe: &HSTRING, title: &str, arg: &str) -> Result<IShellLinkW> {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
        link.SetPath(exe)?;
        link.SetArguments(&HSTRING::from(arg))?;
        link.SetIconLocation(exe, 0)?;
        // Jump List titles must be VT_LPWSTR; PropVariantClear (Drop) frees the string.
        let title = PROPVARIANT {
            Anonymous: PROPVARIANT_0 {
                Anonymous: std::mem::ManuallyDrop::new(PROPVARIANT_0_0 {
                    vt: VT_LPWSTR,
                    Anonymous: PROPVARIANT_0_0_0 {
                        pwszVal: SHStrDupW(PCWSTR(HSTRING::from(title).as_ptr()))?,
                    },
                    ..Default::default()
                }),
            },
        };
        let store: IPropertyStore = link.cast()?;
        store.SetValue(&PKEY_Title, &title)?;
        store.Commit()?;
        Ok(link)
    }

    /// Best effort: a missing Jump List never stops Cadence from starting.
    pub fn install() -> Result<()> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let exe = HSTRING::from(std::env::current_exe().unwrap_or_default().as_os_str());
            let list: ICustomDestinationList =
                CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER)?;
            let mut slots = 0u32;
            let _removed: IObjectArray = list.BeginList(&mut slots)?;
            let tasks: IObjectCollection =
                CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)?;
            for (title, arg) in TASKS {
                tasks.AddObject(&task(&exe, title, arg)?)?;
            }
            list.AddUserTasks(&tasks.cast::<IObjectArray>()?)?;
            list.CommitList()
        }
    }
}

/// Windows only: lets Cadence keep running (and delivering reminders) after the main window
/// closes, with a tray icon as the only way back. Opt-in, read once at startup from the same
/// preference store the frontend writes — enabling it from Settings takes effect on next launch,
/// never retroactively, so a tray never silently appears without a way back.
#[cfg(windows)]
mod background {
    use super::{emit_desktop_command, focus_main_window};
    use tauri::{
        menu::MenuBuilder,
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
        App, Runtime,
    };
    use tauri_plugin_store::StoreExt;

    const PREFERENCES_STORE: &str = "cadence_desktop_preferences.dat";
    const TRAY_ID: &str = "main";
    pub const AUTOSTART_ARG: &str = "--autostart";

    fn requested_at_startup(app: &App) -> bool {
        app.store(PREFERENCES_STORE)
            .ok()
            .and_then(|store| store.get("command_preferences"))
            .and_then(|prefs| prefs.get("backgroundDelivery")?.as_bool())
            .unwrap_or(false)
    }

    /// Builds the tray icon only when the person already opted in before this launch.
    pub fn setup(app: &App) -> tauri::Result<()> {
        if !requested_at_startup(app) {
            return Ok(());
        }

        let menu = MenuBuilder::new(app)
            .text("tray.open", "Open Cadence")
            .text("tray.capture", "Quick Capture")
            .separator()
            .text("tray.quit", "Quit Cadence")
            .build()?;

        let mut builder = TrayIconBuilder::with_id(TRAY_ID)
            .menu(&menu)
            .tooltip("Cadence")
            .show_menu_on_left_click(false)
            .on_menu_event(|app, event| match event.id().0.as_str() {
                "tray.open" => focus_main_window(app),
                // Capture without pulling the whole app forward; the hidden main window still listens.
                "tray.capture" => emit_desktop_command(app, "open-quick-capture", Some("task")),
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
                    focus_main_window(tray.app_handle());
                }
            });

        if let Some(icon) = app.default_window_icon() {
            builder = builder.icon(icon.clone());
        }

        builder.build(app)?;
        Ok(())
    }

    /// A login launch (autostart passes this flag) with the tray ready starts quietly in the tray.
    pub fn starts_hidden(app: &App) -> bool {
        std::env::args().any(|arg| arg == AUTOSTART_ARG) && app.tray_by_id(TRAY_ID).is_some()
    }

    /// Hide instead of quitting exactly when the tray exists, so the window is never hidden
    /// without a way back in.
    pub fn should_hide_on_close<R: Runtime>(app: &tauri::AppHandle<R>) -> bool {
        app.tray_by_id(TRAY_ID).is_some()
    }
}

/// Native store files live under AppData; a name with a separator would escape it.
fn store_path(app: &tauri::AppHandle, name: &str) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    if name.is_empty() || name.contains(['/', '\\', '.']) {
        return Err("invalid store name".into());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{name}.dat")))
}

fn is_valid_json(path: &std::path::Path) -> bool {
    std::fs::read(path).is_ok_and(|b| serde_json::from_slice::<serde_json::Value>(&b).is_ok())
}

/// Run before a store loads: the plugin rewrites the whole file in place, so a crash mid-write can
/// leave it unreadable. If it is, put the last good copy (`.bak`) back instead of losing the data.
#[tauri::command]
fn store_restore_if_corrupt(app: tauri::AppHandle, name: String) -> Result<bool, String> {
    restore_if_corrupt(&store_path(&app, &name)?).map_err(|e| e.to_string())
}

fn restore_if_corrupt(path: &std::path::Path) -> std::io::Result<bool> {
    let bak = path.with_extension("dat.bak");
    if !path.exists() || is_valid_json(path) || !is_valid_json(&bak) {
        return Ok(false);
    }
    std::fs::copy(&bak, path)?;
    Ok(true)
}

/// Run after a store saved: keep a last-good copy, replaced atomically, only if the file is valid.
#[tauri::command]
fn store_snapshot(app: tauri::AppHandle, name: String) -> Result<(), String> {
    snapshot(&store_path(&app, &name)?).map_err(|e| e.to_string())
}

fn snapshot(path: &std::path::Path) -> std::io::Result<()> {
    if !is_valid_json(path) {
        return Ok(());
    }
    let tmp = path.with_extension("dat.tmp");
    std::fs::copy(path, &tmp)?;
    std::fs::rename(&tmp, path.with_extension("dat.bak"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Desktop-only plugins: none of these have an Android/iOS implementation.
    // single-instance must stay the first plugin registered.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let command = launch_command(&argv);
            let _ = app.emit("single-instance", SingleInstancePayload { args: argv, cwd });
            match command {
                // Quick Capture opens its own small window without pulling the main one forward.
                Some(command) if command.command == "open-quick-capture" => {
                    emit_desktop_command(app, &command.command, command.value.as_deref());
                }
                Some(command) => {
                    focus_main_window(app);
                    emit_desktop_command(app, &command.command, command.value.as_deref());
                }
                None => focus_main_window(app),
            }
        }))
        .plugin(tauri_plugin_keyring::init())
        .plugin(tauri_plugin_oauth::init())
        // Main window only: size, position, maximized. Never visibility, so a launch always shows the window.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .with_denylist(&["quick-capture"])
                .build(),
        );

    // Windows only: relaunches Cadence on login so background delivery survives a restart.
    #[cfg(windows)]
    let builder = builder.plugin(
        tauri_plugin_autostart::Builder::new()
            .arg(background::AUTOSTART_ARG)
            .build(),
    );

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingLaunch(std::sync::Mutex::new(launch_command(
            &std::env::args().collect::<Vec<_>>(),
        ))))
        .invoke_handler(tauri::generate_handler![
            take_launch_command,
            save_text_as,
            store_restore_if_corrupt,
            store_snapshot
        ])
        .on_window_event(|window, event| {
            #[cfg(windows)]
            if let tauri::WindowEvent::Focused(focused) = event {
                // Efficient only while no Cadence window has focus: typing in Quick Capture
                // must not leave the host throttled just because the main window lost focus.
                let app = window.app_handle();
                let any_focused = *focused
                    || app
                        .webview_windows()
                        .values()
                        .any(|w| w.is_focused().unwrap_or(false));
                if let Some(main) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                    efficiency::set(&main, !any_focused);
                }
            }
            #[cfg(windows)]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == MAIN_WINDOW_LABEL
                    && background::should_hide_on_close(window.app_handle())
                {
                    api.prevent_close();
                    let _ = window.hide();
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

            #[cfg(windows)]
            if let Err(error) = jump_list::install() {
                log::warn!("jump list: {error}");
            }

            // The main window starts hidden (tauri.conf.json) so a login launch never flashes it.
            #[cfg(windows)]
            let show_main = !background::starts_hidden(app);
            #[cfg(not(windows))]
            let show_main = true;
            if show_main {
                if let Some(main) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                    main.show()?;
                }
            }

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

#[cfg(test)]
mod tests {
    use super::{launch_command, restore_if_corrupt, snapshot};

    #[test]
    fn a_torn_store_comes_back_from_its_last_good_copy() {
        let dir = std::env::temp_dir().join(format!("cadence-store-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("cadence_wal.dat");
        let read = || std::fs::read_to_string(&path).unwrap();

        std::fs::write(&path, r#"{"ops":[1]}"#).unwrap();
        snapshot(&path).unwrap();
        assert!(
            !restore_if_corrupt(&path).unwrap(),
            "a valid file is left alone"
        );

        std::fs::write(&path, r#"{"ops":[1,"#).unwrap(); // crash mid-write
        snapshot(&path).unwrap(); // a torn file never replaces the good copy
        assert!(restore_if_corrupt(&path).unwrap());
        assert_eq!(read(), r#"{"ops":[1]}"#);

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn launch_flags_are_allowlisted() {
        let args = |list: &[&str]| list.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let quick = launch_command(&args(&["cadence.exe", "--quick-capture"])).unwrap();
        assert_eq!(
            (quick.command.as_str(), quick.value.as_deref()),
            ("open-quick-capture", Some("task"))
        );
        let schedule = launch_command(&args(&["cadence.exe", "--schedule"])).unwrap();
        assert_eq!(schedule.command, "navigate-schedule");
        assert!(launch_command(&args(&["cadence.exe", "--sync-now", "--autostart"])).is_none());
        assert!(launch_command(&args(&["cadence.exe", "cadence://navigate-schedule"])).is_none());
    }
}
