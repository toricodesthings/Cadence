# Changelog

What changed in Cadence, newest first. The in-app changelog is built from this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/): MAJOR for big releases, MINOR when a feature is added, changed, or removed, PATCH for fixes and tweaks. Each release starts with a one-line summary (its title in the app), then bullets under `### Added`, `### Changed`, `### Removed`, or `### Fixed`. One change per bullet, one line each: 120 characters at most, or the build fails.

## [Unreleased]

## [0.18.3] - 2026-09-23

### Changed
- Remove a tag from a task or thought by clicking it; an × appears on hover.
- List and Section in task details open a proper menu on desktop, and thought details match the task layout.

### Fixed
- The reminder time in task details no longer gets squeezed next to its switch.

## [0.18.2] - 2026-09-23

Capture keeps up with you, and Projects are now Lists: jot it, tick it off or give it a day in one move.

### Added
- Tick off anything in Capture straight away; it shows in Completed marked as a thought.
- Sort Capture by newest, oldest or priority, and use Focus views there like on Today.
- Paste several lines into Capture and add them as separate thoughts in one go.
- Keep a thought as a note in Capture, so ideas don't have to become tasks.
- Pick a list and tags for a thought before giving it a day.
- Select several things in Capture and give them a day, or discard them, together.
- "Sort these with Cadence" asks the assistant to group your thoughts; you approve each suggestion.
- Thoughts older than two weeks fold into Older, out of the way but still there.
- Search now finds thoughts in Capture too.
- Capture on desktop can show rows or a board, like Today and Upcoming.
- On desktop, drag a tag from the sidebar onto a Capture row to tag it.
### Changed
- Lists show a plain task count in the sidebar, matching Capture.
- The notification bell shows your unread count on desktop and mobile, hiding it when everything is read.
- Routines shows how many are still due today, clearing as you complete or skip them.
- Capture counts, Routine indicators, and notification bells share a softly highlighted badge design.
- Capture's input is a lantern-lit field that glows when you type, with a Capture button and key hints.
- Tags on a thought or task show right on its Capture row, no need to open it.
- Projects are now called Lists, in the app and in the assistant; a list shows as rows or a board.
- Capture uses Today and Upcoming's card styling, with New and No day yet groups and shared day buttons.
- On your phone, the Capture sheet stays open after each thought so you can add several in a row.
- "Open full task editor" is now "Make it a task": no day is set and you can undo it.
- Capture suggests the day you typed or your lightest day, instead of always Today.
### Fixed
- Notification and Routine counts use softer badge backgrounds with clearer, higher-contrast numbers.
- Capture rows are more compact, with one suggested day, shared button typography, and clearer spacing.
- The Capture count in the sidebar now matches what's on the page.
- New thoughts stay at the top of Capture instead of jumping to the bottom once saved.
- "Later" no longer puts a thought on a day it spotted in the text; it keeps it with no day.
- Picking a detected date like "tomorrow at 3pm" now keeps the time.
- "Before March" or "before Friday" now means the day before, and the word leaves the title with the date.
- Keyboard shortcuts on Capture (1, 2, 3, Enter, Backspace) now work, and the hints only show on the focused row.
- ⌘ Enter in the Capture field now adds the line straight as a task, as the hint says.
- Esc in the Capture field no longer erases what you typed.
- Discarding or placing a thought can now be undone from the toast.
- Title edits in a thought's details are kept when you close them.
- The Place panel no longer cuts off the weekend and its buttons.
- On your phone, the Capture sheet opens with the keyboard ready.
- The assistant no longer treats thoughts you discarded as still waiting in Capture.
- Text on main amber buttons is dark again, so labels are readable everywhere.
- Undo in toasts sits beside the message instead of wrapping underneath it.
- The Place panel's title and hint are no longer hidden behind the panel switcher.

## [0.18.1] - 2026-09-23

The assistant gets to the point, sounds like the voice you picked, and can explain any part of Cadence.

### Added
- Ask the assistant how anything in Cadence works or where it lives, and it explains and links you there.
- A new Full approval mode lets the assistant apply every change, permanent deletes included, without asking.

### Changed
- The assistant's four voices (Secretary, Coach, Minimalist, Companion) now each sound clearly different.
- The assistant talks more like a friend: short, relaxed replies unless you ask for more.
- The assistant no longer asks in chat before showing a suggestion card.
- Asking the assistant to delete a task now moves it to Trash unless you say permanently.

### Fixed
- Auto mode now waits for your tap before permanently deleting anything.

## [0.18.0] - 2026-09-23

### Added
- Tap the assistant's "Looked a few things up" chip to see exactly which lookups it ran and with what.
- The assistant can add, edit, tick off or delete subtasks, and add, remove or swap tags, after you confirm.
- Assistant task cards mark tags being added (+) or removed (−), each in the tag's own colour.
- In Week and Day view, whatever the current-time line is passing through glows with a shimmering border.

### Fixed
- Assistant suggestion cards no longer squeeze to a narrow box when they arrive without a reply above them.
- Correcting the assistant right after it adds something ("wait, 6pm") now updates that item instead of adding a copy.
- The assistant now knows Urgent is a priority level above High, instead of treating High as the ceiling.
- The assistant can now see and set a task's effort level (Low/Medium/High); it had no access to it before.
- Saying a task is "hard" or "very easy" now sets its effort level, shown as a chip on the suggestion card.
- A task suggestion or update now shows its priority as a small colored icon by the title, matching the task list.
- The assistant no longer treats fixed blocks like classes as overdue tasks, and sees each repeat on its own day.
- Tasks timed for late evening now show on Today instead of going missing when that time is past midnight UTC.
- The time dropdown in create and edit dialogs scrolls again instead of staying stuck on the first few times.
- Setting a block's end to its start time (4pm–4pm) now moves the end an hour later instead of making it 24 hours.
- Typing a time on desktop and pressing Enter now keeps what you typed instead of snapping back or resetting to 0:00.

## [0.17.0] - 2026-09-23

Tags are now a real place to visit on your phone.

### Added
- On your phone, each tag has its own page of tasks, where you can add, rename, recolour or delete it.
- Add Cadence to your iPhone or iPad Home Screen from Safari for a full-screen app with its own icon.
- On your phone, add, rename and delete a project's sections from one Sections sheet.
- The assistant has an Auto mode that applies its suggested changes without asking; Ask first stays the default.
- You can add images to an assistant message (preview only for now; they aren't sent yet).
- On your phone, press and hold an assistant message to copy, edit or regenerate it.

### Changed
- On your phone, tags are picked from a thumb-sized sheet where you can also make new ones.
- On your phone, projects look like Today, and the add button opens the Schedule-style composer for that section.
- On your phone, the add button on Events adds an event directly; the button at the top is gone.
- On your phone, adding an event opens the same draggable sheet as Schedule, with your phone's own date picker.
- Date and time fields now match everywhere: your device's own pickers on touch, one calendar and time list otherwise.
- Quick Add now uses the shared composer: a sheet on phones, drafts kept per tab, and a prompt before discarding.
- Creation and notification dialogs now show an icon beside their title and a faint accent-colour glow.
- The assistant has a fresh look: its own sigil icon, softer replies, a roomier composer and a jump-to-latest button.
- The assistant's lookups now show in the order they happened, above the reply they led to.

### Fixed
- On your phone, tapping a tag no longer sends you back to Capture.
- Cadence no longer gets stuck loading when the assistant's last conversation was deleted; it starts a new one.
- After a reload, the assistant shows its latest replies instead of an older saved copy of the conversation.
- The assistant's task-update suggestions now name the task instead of saying “this task”.
- Section and control tabs in a narrow window now scroll with a mouse wheel or drag.
- Tasks in a deleted section move to Unsectioned right away instead of disappearing until a refresh.
- Reminders now show as notifications in the Home Screen app on iPhone and iPad.
- Headers and the dock stay clear of the notch, status bar and home indicator.
- Assistant message buttons no longer overlap the lookup chip or crowd the next message.
- Assistant read receipts now show read only once it actually starts on your message, not the moment you send.

## [0.16.0] - 2026-09-22

Schedule on your phone opens on your day, keeps the month out of the way, and puts everything within reach.

### Added
- Swipe a task on your phone's Schedule to finish it, or to move it to tomorrow or another day, with Undo.
- Free time between plans shows as space you can tap to fill.
- "Lighten today" moves the rest of today's tasks to tomorrow or clears their dates in one step, with Undo.
- Ready tasks from Holding can be placed on the day you're viewing, straight from Schedule.
- A "Show fixed blocks" switch, alongside the ones for tasks and routines.

### Changed
- On phones, Month folds into your week as you scroll, so the day's plans get the whole screen.
- On phones, Day view names the day and shows your week above it; the separate Week view is gone.
- On phones, Day, Month and Year zoom into each other: tap the label above the title to zoom out.
- Fixed blocks, routines and tasks each look like what they are on your phone's Schedule.
- Adding to Schedule on a phone starts with one line; "lunch with Sam fri 1pm" fills in the day and time.
- Year view on phones opens on the current month; tap a month to open it.

### Fixed
- Days with only routines no longer show as open in Month view on phones.
- Past times no longer fade on days that haven't happened yet.
- Undo right after a change no longer fails with "Task changed elsewhere".
- Opening a routine from Schedule on a phone or tablet no longer leaves the page.
- The assistant now knows your local date and time, so "today" and "tomorrow" are right late in the evening.
- The assistant quotes task times in your time zone instead of UTC.
- Assistant suggestion cards show the right day and include the time for timed tasks.

## [0.15.1] - 2026-09-22

Timezone-aware dates and task reliability

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
