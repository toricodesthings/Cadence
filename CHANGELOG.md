# Changelog

What changed in Cadence, newest first. The in-app changelog is built from this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/): MAJOR for big releases, MINOR when a feature is added, changed, or removed, PATCH for fixes and tweaks. Each release starts with a one-line summary (its title in the app), then bullets under `### Added`, `### Changed`, `### Removed`, or `### Fixed`. One change per bullet, one line each: 120 characters at most, or the build fails.

## [Unreleased]

### Changed
- Settings now shows the time zone Cadence uses (your device's) instead of a lock option that had no effect.

### Fixed
- Dragging tasks into a new order now saves instead of failing.
- "Today" and quick due dates no longer land on the wrong day late in the evening or early morning.
- Moving a timed block on the schedule keeps it on the day you dropped it in every time zone.
- Adding a tag a task already has no longer shows an error.
- Processing the same inbox item twice no longer creates a duplicate task.

## [0.15.0] - 2026-09-21

Routines replace Habits, and Today gets a day strip

### Added

- Today opens with a day strip of timed things, like classes and shifts, showing what's on now and what's next.
- Routines can have an emoji. Hover any routine or event emoji to change or remove it.
- A routine can have a different time on some days, like 7:00 on Mondays and any time on Saturdays.
- Repeats ask "If you miss one…": still owed (a task), let it go (a routine), or it just passes (a fixed block).
- Repeats named like a class, shift or meeting, with a start and end time, start out as fixed blocks.
- A Settings switch (Tasks → Routine streaks) hides routine streaks everywhere.

### Changed

- Habits are now called Routines everywhere. Old /habits links still work.
- Today lists each routine once, with its time, and folds finished ones into "2 done".
- "Needs attention" is now "Still open", in a calmer colour, and only shows when a task carries over.
- Creating a routine now works like adding to the schedule, with extras folded under More options.
- Missed routines let go instead of piling up on Today, Upcoming and in reminders.
- The active tag filter now sits in the page header. Click it to clear.

### Removed

- The Rhythms column on Today. Fixed blocks moved to the day strip, and routines to the Routines list.

### Fixed

- Checking off or skipping a routine from Upcoming or Schedule updates instantly and works offline.
- Late at night, the week, day and routine views no longer jump ahead to tomorrow.

## [0.14.4] - 2026-09-21

A new phone layout, with one-tap placing

### Changed

- The phone dock is now Capture, Schedule, the assistant, Habits and Browse.
- A workspace menu with Today, Upcoming, projects and tags opens from the left of every phone header.
- Browse opens with a profile card and one tap through to Profile & Security.
- Adding on a phone always uses the round button in the bottom-right, clear of the dock.
- Search, schedule creation and routine creation open as swipe-up sheets you can flick away.
- The Habits header on a phone now matches Schedule and Capture.
- Toasts on phones are smaller, sit at the top of the screen and can be flicked away.
- Sort and view controls open in a small menu instead of taking over the phone screen.
- Upcoming uses the same task cards as Today, with routines grouped under each day.
- A task's ⋮ menu on a phone is now Pin, Duplicate and Trash. Everything else lives in task details.
- Task details can now change a task's project, section and reminder.
- Adding a project or tag on a phone opens a full-size form with big colour swatches.
- Place waiting captures on Today, Tomorrow or the lightest day in one tap, with Undo.
- On desktop, Capture's side panel is now a Place panel: drag tasks onto a day this week or next.
- Tasks that already have a date no longer sit in "Ready to place".
- The phone calendar follows your finger as you swipe between days, weeks or months.
- Board columns sit closer to the top, and long lists scroll again on phones.

### Fixed

- A routine missed on several days now shows once under "Routines to catch up".

## [0.14.3] - 2026-09-18

A floating glass dock

### Changed

- The phone and tablet navigation bar is now a floating glass dock, with the assistant glowing in the middle.

## [0.14.2] - 2026-09-17

A proper editor for fixed time blocks

### Added

- Fixed time blocks get their own editor, with start and end times, weekdays, and start and end dates.
- A wrong AM or PM time can be fixed in one tap.

### Changed

- Time pickers accept any typed minute, like 2:37 PM or 14:37, and use the built-in picker on phones.
- The schedule popover's time section is a simple From/To row, so end times can change there too.
- The Duration tab is always all-day. Times only live on Deadline.
- "Not before" is now "Hide until", with a plain date picker.

### Fixed

- Editing a task's time no longer fails with a server error on some tasks.
- Editing the same task's time again no longer triggers a false "modified by another client" conflict.

## [0.14.1] - 2026-09-16

One look for headers, panels and dialogs

### Changed

- Habit names and details are larger in the weekly grid, with a wider name column.
- Schedule and Habits header buttons are full height, and the view switcher is now a dropdown.
- Every page header shares one design, with a small label above the title.
- Events has its own icon in the navigation rail, and its page is simpler.
- The desktop notification preview has softer glass and a roomier empty state.

### Fixed

- Panels, cards and dialogs take their colour from your background instead of grey or navy.
- The side panel for tasks, habits, events and captures is a darker glass that follows your theme.
- Rename and delete dialogs now match, and project rename buttons are no longer squished.
- Dialogs use a soft, blurred glass that matches your background.
- Phone sign-in retries before giving up, and shows a recovery message instead of spinning.
- Glass blur is back on menus, previews and other glass surfaces.

## [0.14.0] - 2026-09-16

Bottom tabs on phones, and a full notification panel

### Added

- The notification preview expands into a full panel with search, filters, sorting and bulk clearing.

### Changed

- Phones and tablets get bottom tabs, with the assistant in the middle.
- Capture on a phone has separate tabs and an Add sheet. Focus and Controls open as sheets.
- Settings and Notifications open as swipe-down panels, with Profile & Security inside Settings.

### Fixed

- The loading screen prepares your first page before showing it, and offers recovery if loading fails.

## [0.13.0] - 2026-09-16

One shared editor for tasks, events and habits

### Changed

- Tasks, events and habits share one editor layout that saves changes in place.
- Capture clarification uses the shared editor, keeping its suggestions and placement tools.
- On cadenceapp.cloud, Emilie's sigil and the "Start now" seal are drawn in the logo's colours.

### Fixed

- Closing an edit panel smoothly hands its space back to the page instead of snapping.
- Editing a habit after viewing its history no longer corrupts other habit data.
- Resizing the Today and Upcoming panels no longer clips their contents or close button.
- Recurring timetables can be moved to Trash by right-clicking a calendar block.
- Photo backgrounds no longer flash when switching pages.
- On cadenceapp.cloud, the constellation is one connected figure, drawn line by line as you scroll.
- On cadenceapp.cloud, the "Start now" seal has more room and the footer glow is softer.

## [0.12.0] - 2026-09-15

Photo backgrounds, and a calmer task panel

### Added

- Use your own photo as the background, with preview, crop, blur and brightness.
- Photo mode picks an accent for you, samples one from the image, or lets you choose your own.
- Photos are stored privately, without camera or location data.
- On cadenceapp.cloud, Get started rolls a bank of clouds across the screen on the way to sign-up.

### Changed

- Task details are grouped into Status, When, Weight and Organize, each with a short summary.
- The assistant is now called Emilie by default. If you renamed her, she keeps your name.
- The welcome page has new words: "Built for the real you, not the perfect one."

### Fixed

- Weekly Reset, calendar cards, notifications and Settings now adapt to your background colours.
- Task panel buttons are no longer hidden, and long titles no longer get cut off on phones.

## [0.11.1] - 2026-09-13

One location setting you control

### Added

- A Location & Weather page in Settings: choose approximate, precise, a place you pick, or none.
- "Forget saved location" removes any location kept on this device.

### Changed

- Weather and holidays share one location, using your approximate area by default.
- Weather on Home can be turned off without turning off location.
- Holidays pick your country from your time zone first.
- Precise location finds you faster and uses less battery.

### Removed

- The "Store dismissed prompts" switch, which didn't do anything.

### Fixed

- Cadence no longer asks for your location again after you've decided.
- Signing out clears the location saved on the device.
- People elsewhere in the Americas no longer get US holidays.

## [0.11.0] - 2026-09-13

A moonlit loading screen

### Changed

- The loading screen is a moonlit autumn valley that follows your season, theme and motion setting.
- "Captured" confirmations now appear as a regular notification.
- The Schedule's Add task and Add event window is roomier, with Mon–Sun weekday buttons.

### Fixed

- Closing Capture's side panel slides it shut instead of snapping.
- Header lines now line up across every page.
- A task added from the Schedule's Day view appears right away.

## [0.10.0] - 2026-09-12

Habit fixes and cleanup

### Removed

- The early Expo mobile prototype. Mobile will come from the same codebase as the desktop app.

### Fixed

- The version shown in Settings always matches the latest release.
- Editing, pausing or archiving a habit no longer resets its reminder, colour or mode.
- Editing an archived habit no longer brings it back.

## [0.9.1] - 2026-09-11

Under-the-hood upgrades for a faster, sturdier Cadence

### Changed

- Cadence now runs on the latest versions of the frameworks and tools it is built on.

### Fixed

- A handful of rare glitches caught while upgrading.

## [0.9.0] - 2026-09-10

Your assistant now names conversations and shows its work

### Added

- Conversations get a title automatically after your first message.
- See how much of your assistant allowance you have used.
- Results from the assistant's tools stay with the conversation when you come back to it.

## [0.8.1] - 2026-06-25

Assistant fixes

### Fixed

- Bug fixes and polish for the assistant after launch.

## [0.8.0] - 2026-06-17

Meet the Cadence assistant

### Added

- A calm assistant in the side panel that works with your real tasks and waits for your approval.
- Conversations are saved, and replies pick up where they left off after a reconnect.
- Choose the assistant's personality in Settings.

### Changed

- The sidebar and search adapt better to small screens.

## [0.7.1] - 2026-06-05

Behind-the-scenes cleanup

### Changed

- Internal restructuring to keep Cadence reliable as it grows. Nothing looks different.

## [0.7.0] - 2026-03-26

Better themes and personalization

### Changed

- Themes and personalization have been vastly improved.

## [0.6.0] - 2026-03-24

Events and small tweaks

### Added

- Personal events in the calendar, plus small improvements and fixes across the app.

## [0.5.0] - 2026-03-20

Cadence understands natural language

### Added

- Type tasks the way you'd say them, and Cadence fills in the details.

## [0.4.0] - 2026-03-19

Holding that actually holds

### Changed

- A reworked holding page and task editor, so capturing is quick and editing is simpler.

## [0.3.0] - 2026-03-17

Task and planner improvements

### Added

- Better all-day tasks, and refreshed Upcoming and Today pages.

## [0.2.0] - 2026-03-16

Major bug fixes

### Fixed

- Stability fixes across the pre-release app, smoothing rough edges and regressions.

## [0.1.0] - 2026-03-15

Initial release

### Added

- The first public Cadence beta, with the core planning experience.
