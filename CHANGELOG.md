# Changelog

What changed in Cadence, newest first. The in-app changelog is built from this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/): MAJOR for big releases, MINOR when a feature is added, changed, or removed, PATCH for fixes and tweaks. Each release starts with a one-line summary (its title in the app), then bullets under `### Added`, `### Changed`, `### Removed`, or `### Fixed`.

## [Unreleased]

### Added

- Today now opens with a strip of the things that happen at a set time, like classes and shifts, in order through the day: what's happening now, and what's next and how long until it starts. Tap it to fold it away.
- Routines can have an emoji, picked the same way as for events. It shows on Today, on the Routines page and in the day strip.
- A routine can have a different time on some days, such as the gym at 7:00 on Mondays and any time on Saturdays.
- A repeating task or routine now asks "If you miss one…": still owed (a task that carries over), let it go (a routine), or it just passes (a fixed block with no check-off). Switching moves it over with Undo.
- Repeating tasks named like a class, lecture, shift or meeting, with a start and end time, now start out as fixed blocks. You can change this with one tap.
- A Settings switch (Tasks → Routine streaks) hides routine streaks everywhere.

### Changed

- Habits are now called Routines everywhere, including the page, the dock, search and quick add. Old links to /habits still work.
- Today shows each routine once. Routines sit in one light list with their time, and finished ones fold into "2 done", which you can reopen and undo.
- "Needs attention" is now "Still open", in a calm colour, and only appears when a task has carried over.
- Creating a routine now looks and works like adding to the schedule: name and emoji first, then which days, then "Any time" or a set time with an optional reminder, and everything else folded under More options. Closing with unsaved changes asks first.
- A missed routine now lets go instead of piling up: it no longer shows on Today or Upcoming as something to catch up on, and the routine reminder only mentions today.

### Removed

- The Rhythms column on Today. Its fixed blocks moved to the day strip and its routines to the Routines list.

### Fixed

- Checking off or skipping a routine from Upcoming or the Schedule now updates straight away, works offline, and says so if it fails.
- The week and day views and the routine grid now mark the right day as today late at night, instead of jumping ahead to tomorrow, and the week view files tasks under the right day.

## [0.14.4] - 2026-09-21

### Changed

- Board columns on Today, Upcoming and projects now sit closer to the top of the page instead of floating below an empty gap.
- The phone dock is now Capture, Schedule, the assistant, Habits and Browse. Today, Upcoming, your projects and your tags moved into a workspace menu that opens from the left of the Capture header.
- Browse now opens with a profile card — your picture, a "Hey, Sam" greeting, and one tap through to Profile & Security — above Events, Weekly Reset, Settings, Completed, Trash and support.
- Adding to the schedule on a phone now uses the same round button in the bottom-right corner as every other page, so it no longer sits on top of the dock, and the header's add button is gone.
- Search and the schedule's create panel now slide up as draggable sheets you can flick down to dismiss, like the rest of the app's mobile panels.
- Creating a routine on a phone now opens the same swipe-up panel as everywhere else, with the fields scrolling and Cancel and Create pinned within thumb reach, and the Add Routine button moved to the round button in the bottom-right corner so it no longer sits on top of the dock.
- The Habits header on a phone now matches Schedule and Capture: the month, the arrows and a small options button on one row, Week and Month plus Today on the next.
- Toasts are smaller and calmer on phones: they now appear at the top of the screen, away from the dock, and can be flicked away in any direction.
- Page controls like sort and view no longer take over the whole screen on a phone — they open in a small menu, with sort sliding in as a sub-panel.
- The workspace menu (Today, Upcoming, projects, tags) now opens from the left of the header on every phone page, not just Capture.
- Upcoming now shows the same task cards as Today, with routines grouped underneath each day, instead of its own plainer list.
- Board columns on a phone no longer repeat their name under the column chooser, and long lists scroll again on Today and Upcoming.
- On a phone, a task's ⋮ menu is now just Pin, Duplicate and Move to Trash; everything else is edited in the task's details.
- Task details now let you change the project and section and turn a reminder on or off, instead of only showing them.
- On a phone, the View switch in page controls now spans the whole menu, and the Sort row shows the current order.
- Adding a project or tag from the phone workspace menu now opens a full-size form in the same panel, with a back button, big colour swatches and a Create button within reach.
- On a phone, tasks waiting in Capture now have one-tap buttons to place them on Today, Tomorrow or the lightest day of the week, with Undo. "Pick day…" and the header calendar open a swipeable week that shows how busy each day is and what's already on it, replacing the old calendar panel.
- Tasks that already have a date no longer sit in Capture's "Ready to place" list.
- On desktop, Capture's side panel is now a Place panel: this week and next as day tiles, with small dots showing how busy each day is. Drag a new capture or a waiting task onto a day to place it, or hover a task for the same one-click Today, Tomorrow and lightest-day buttons as on phones. Click a day to see what's on it. The old month calendar and its count bubbles are gone.
- On phones and tablets the calendar now follows your finger as you swipe it sideways to move between days, weeks or months, springing back if you change your mind, and an empty day greets you with a calm note instead of a bare line of text.

### Fixed

- A routine you missed on several days now shows once under "Routines to catch up" on Today and Upcoming, instead of once for every missed day.

## [0.14.3] - 2026-09-18

### Changed

- The phone and tablet navigation bar is now a floating glass dock that hovers above the bottom edge instead of an attached bar, with softer blur, a gentle shadow, and the assistant orb glowing in the middle.

## [0.14.2] - 2026-09-17

### Added

- Recurring time blocks (Fixed block rhythms) now get a dedicated editor in the task's Details panel: start and end time pickers with a live duration hint, repeat weekday chips, and "Starts on" / "Ends on" date controls for the series. A wrong time — like 3:55 AM instead of PM — is fixed in one tap, and the "Not before" row no longer appears where it doesn't apply.

### Changed

- Time pickers accept typed times in any minute (like 2:37 PM or 14:37) with quick-pick suggestions on desktop, and use the phone's built-in time picker on mobile.
- The schedule popover's time section is now a simple From/To row with the same typeable pickers, so a block's end time can be changed there too. The Duration tab is always all-day — times only live on Deadline.
- "Not before" is now "Hide until" with a plain date picker: pick a date to keep the task hidden until then, or leave it "Always shown".

### Fixed

- Editing a task's time no longer fails with a server error on seeded or recently-saved tasks. Timestamps are now sent and stored in a consistent ISO format, so adjusting a block's start or end time just works.
- Repeatedly editing the same task's time no longer triggers a false "modified by another client" conflict — the server's change detection now compares the actual moment, not the text format.

## [0.14.1] - 2026-09-16

### Changed

- Habit names and their streak, status and time details are larger in the weekly grid, with a wider name column so fewer titles get cut off.
- Schedule and Habits header controls (Today, view toggles, Add Routine) are no longer squished, matching the height of buttons elsewhere. Schedule's Day/Week/Month/Year switcher is now a dropdown instead of a row of buttons.
- Page headers share one design: the same height, a darker blurred bar, and a small label above each title. Schedule now shows its name in the header.
- Events now has its own icon in the navigation rail alongside Schedule and Habits, instead of being tucked under Capture. Its page is simpler: Add event sits in the header, sorting is a small pill beside the title, and the Open Schedule button is gone.
- The desktop notification preview has softer glass and a spacious, centered empty state that stays the same height as a three-notification preview.

### Fixed

- Panels, cards, dialogs, page headers and dropdown lists now take their color from your background: green, purple or warm themes get matching dark surfaces instead of grey or navy, and the default theme stays a consistent navy.
- The task, habit, event and capture side panel no longer shows a flat navy background or box under warm accents — it's a darker glass that follows your theme's color throughout, and its "Task"/"Habit"/"Event"/"Capture" header label is bigger and back to matching the size of other panel titles.
- Rename and delete dialogs now look the same: matching corners, title style, spacing and full-height buttons. Project rename buttons are no longer squished, and dialog widths now apply on desktop.
- Dialogs now use a soft, blurred glass that matches your background. This includes Add event, the Schedule create dialog, Quick Add, search, Settings, Notifications and Sync Inspector.
- Phone sign-in keeps OAuth callbacks out of the offline cache and retries session restoration before entering the app. If sign-in can't finish, Cadence shows a recovery message instead of spinning indefinitely.
- Restore background blur on notification previews, menus and other glass surfaces in production. Capture's three-dot menu now uses the shared dropdown, and old preview caches no longer keep development styles stale.

## [0.14.0] - 2026-09-16

### Added

- Expand the compact desktop notification preview into a full panel with search, unread filters, sorting, read/unread controls, quick actions, and bulk clearing; mobile opens the full panel directly.

### Changed

- Mobile Capture now has separate tabs and an Add sheet, the assistant sits in the center of the taskbar, and Focus and Controls open draggable sheets from the header. Browse holds search, Habits and Settings, and mobile Rhythms stay visible.
- Mobile and tablet navigation now has bottom tabs, swipe-down Settings and Notifications panels, Profile & Security and sign-out inside Settings, and compact page controls.

### Fixed

- The loading screen now prepares the first page's data before revealing it, reuses saved data, and shows recovery options if loading fails. Its slightly smaller wordmark rolls briskly like a rotating cube into “Preparing your workspace,” with tighter letter spacing on the preparation message. Startup also avoids unnecessary session checks and loading unopened tools.

## [0.13.0] - 2026-09-16

### Changed

- Capture clarification now uses the shared editor while keeping its suggestions and placement tools. Editor headers identify Capture, Task, Rhythm, Habit or Event, and panel controls share the same borderless style.

- On cadenceapp.cloud, Emilie's sigil and the "Start now" seal are drawn in the logo's colours, orange and amber with a touch of berry, with a soft glow.
- Tasks, events and habits now share one editor layout with simpler sections and changes saved in place. Event cards open the editor when clicked outside their buttons, event and habit panels animate open and closed, and habit menus use the same editor. Creation keeps its popup.

### Fixed

- Closing an edit panel now smoothly returns its space to the page instead of snapping at the end of the slide. All edit panels share the same resize and animation behavior.

- Creating or editing a habit after viewing its history no longer corrupts other habit data, and quick successive edits save in order.

- Resizing the Today and Upcoming task panels no longer clips their contents or close button. Task details retain their X close button, and page headers include a rightmost button to close the right panel, including the assistant on Events.

- Recurring timetables can now be moved to Trash by right-clicking a calendar block. The shared task editor has a full-width Trash button below Subtasks instead of a header menu, with clear wording when it removes the whole series. Undo reopens the restored task’s details.

- Photo backgrounds no longer flash when switching pages. Toasts, offline banners and shared account controls now follow the active background palette.

- On cadenceapp.cloud, the constellation near the end of the page is now one connected figure, drawn line by line as you scroll, and its lines no longer run through the names.

- The "Start now" seal at the end of cadenceapp.cloud is smaller and has more room around it, and the line beneath it no longer overlaps its petals.

- The footer of cadenceapp.cloud no longer shows a light band with hard edges; its glow is now a soft pool of light.

## [0.12.0] - 2026-09-15

### Added

- On cadenceapp.cloud, pressing Get started, "Start where you are" or the seal at the end of the page rolls a bank of clouds across the screen on the way to sign-up.
- Appearance settings now offer Cadence backgrounds or your own photo in one panel. Curated themes set the background and palette; photo mode puts automatic, sampled and custom accents below your image. Preview, zoom and crop before uploading, then adjust blur and brightness. Photos are stored privately without camera or location metadata and remain saved when you switch back to Cadence.

### Changed

- The task details panel is calmer: Details is split into Status, When, Weight and Organize groups, choices fill the width with icons, and each section shows a short summary before you open it.
- The welcome page at cadenceapp.cloud has new words: "Built for the real you, not the perfect one."
- The assistant is now called Emilie by default. If you gave her another name in Settings, she keeps it.

### Fixed

- Weekly Reset, calendar cards, notifications and Settings now adapt to your background colors, with clearer secondary text and softer transitions between panels when using a photo.
- The task details panel's buttons are no longer hidden behind the panel switcher, long task titles no longer get cut off on phones, and the phone sheet shows one close button instead of two.

## [0.11.1] - 2026-09-13

### Added

- A Location & Weather page in Settings shows where Cadence thinks you are and what uses it, and lets you choose an approximate area, your precise location, a place you pick yourself (including a city for weather), or no location at all.
- A "Forget saved location" button removes any location Cadence has kept on this device.

### Changed

- Weather and holidays now share one location setting. By default they use your approximate area from your network connection, so your browser only asks for your location if you choose precise location.
- You can turn the weather on Home off without turning off location.
- Holidays now pick your country from your time zone before your language settings, so fewer people see another country's holidays.
- Precise location finds you faster and uses less battery.

### Removed

- The "Store dismissed prompts" switch in Data & Export, which didn't do anything.

### Fixed

- Cadence no longer asks for your location again after you've decided, including after signing in again, opening a new tab, or turning precise location off.
- Signing out now clears the location saved on the device, so the next person who signs in doesn't inherit it.
- People in Mexico, Brazil, and other countries in the Americas no longer get US holidays when Cadence guesses from the time zone.

## [0.11.0] - 2026-09-13

### Changed

- The loading screen now opens onto a deeper, moonlit autumn valley with layered hills, drifting mist, reflections on the water and falling maple leaves, and it shows the right season, light or dark look, and reduced-motion setting from the very first frame.
- The "Captured" confirmation on the Capture page now appears as a notification in the bottom-right corner, like the rest of the app's notifications.
- The Add task / Add event window on the Schedule page breathes more: roomier header, weekday buttons that read Mon–Sun and fill the row, a shorter timetable-anchor note, and icons on the priority and effort choices under More options.

### Fixed

- Closing the side panel on the Capture page now slides it shut smoothly instead of snapping away.
- The lines under the page header and the side panel headers now line up across every page.
- A task added from the Schedule page's Day view now shows up on the calendar right away instead of after a refresh.

## [0.10.0] - 2026-09-12

### Removed

- The early Expo mobile prototype. Mobile will come from the same codebase as the desktop app.

### Fixed

- The version shown in Settings now always matches the latest release.
- Editing, pausing, or archiving a habit no longer resets its reminder, color, or mode, and editing an archived habit no longer brings it back.

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

- A calm assistant in the side panel that works with your real tasks, projects, habits, inbox, and calendar. It proposes changes and waits for your approval.
- Conversations are saved, and replies pick up where they left off after a reconnect.
- Choose the assistant's personality in Settings.

### Changed

- The sidebar and search adapt better to small screens.

## [0.7.1] - 2026-06-05

Behind-the-scenes cleanup

### Changed

- Internal restructuring to keep Cadence reliable as it grows. Nothing looks different.

## [0.7.0] - 2026-03-26

Better themes, and personalization

### Changed

- Themes and personalization have been vastly improved.

## [0.6.0] - 2026-03-24

Events and minor tweaks

### Added

- Personal events support in the calendar, and various minor improvements and bug fixes across the app.

## [0.5.0] - 2026-03-20

The NLP Parser is here!

### Added

- Cadence can now understand natural language input across the app, making it easier than ever to capture and edit tasks on the go.

## [0.4.0] - 2026-03-19

Holding that actually Holds

### Changed

- Big changes to the holding page and task editor, capture is seamless and frictionless, and the task editor is more intuitive and powerful than ever.

## [0.3.0] - 2026-03-17

Task and Planner improvements

### Added

- New features and quality-of-life improvements to task management, including better support for all-day tasks, and revamp to the Upcoming and Today pages.

## [0.2.0] - 2026-03-16

Major bug fixes

### Fixed

- Stability improvements across the pre-release app, with a focus on fixing rough edges and regressions.

## [0.1.0] - 2026-03-15

Initial Release

### Added

- The first public Cadence beta, establishing the core planning experience and initial support pages.
