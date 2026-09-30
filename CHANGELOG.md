# Changelog

What changed in Cadence, newest first. The in-app changelog is built from this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/): MAJOR for big releases, MINOR when a feature is added, changed, or removed, PATCH for fixes and tweaks. Each release starts with a one-line summary (its title in the app), then bullets under `### Added`, `### Changed`, `### Removed`, or `### Fixed`. One change per bullet, one line each: 120 characters at most, or the build fails.

## [Unreleased]

### Changed

- The desktop "Sign-in complete" browser page now matches the sign-in card, with the logo and a soft entrance animation.
- Desktop updates now live on the redesigned About page, with a "Last checked" time and a cleaner update prompt.

## [0.25.3] - 2026-09-30

### Fixed

- On desktop, signing out now works instead of flickering between screens and leaving you signed in.

## [0.25.2] - 2026-09-30

### Fixed

- On desktop, the header's Update button now opens the install dialog instead of only opening Settings.
- On desktop, signing in with Google or GitHub no longer fails the first time with an "already used" error.

## [0.25.1] - 2026-09-30

### Changed

- On desktop, layout scale now runs from 75% to 150% in thirteen steps, picked from the header or Appearance.

### Removed

- On desktop, the header's "Up to date" pill is gone; sync news shows in the banner, and Sync is in the rail.

## [0.25.0] - 2026-09-30

Pick the loading screen's scene, and the assistant is faster and cheaper to run.

### Added

- Choose the loading screen scene in Appearance, or leave it on Auto to follow the season.

### Changed

- The loading screen is calmer: a quieter logo halo, softer lanterns and leaves, and glassier clouds.
- The assistant is faster and cheaper to run, with every tool and ability kept.

### Fixed

- Wi-Fi with a sign-in page (hotels, cafés) or a dropped connection no longer signs you out.

## [0.24.0] - 2026-09-28

Cadence keeps working without a connection and catches up when you're back.

### Added

- Cadence opens offline on phones and desktop, showing your last few weeks and the weeks ahead.
- Tasks, subtasks, notes, tags, lists and Trash all work offline, and changes show a cloud mark until they sync.
- Changes that can't sync are listed with the reason, and you can retry or discard each.
- A toast tells you when you go offline and when you're back.
- On Android, offline changes sync even after you close the app.
- A toast with a Reload button appears when a new version of Cadence goes live.
- Add or reset your password from Settings with an emailed code, including if you signed up with Google or GitHub.

### Changed

- On phones, every page header now matches Schedule's, and icon-only buttons share one glass outline.
- On phones, the Schedule month folds and unfolds the moment you swipe.

### Fixed

- A weak connection no longer loses a change or signs you out; the change waits and syncs.
- Offline changes no longer sync twice or into another account after switching accounts.
- Errors in Profile & Security, like a wrong password, now show a message instead of sticking on Saving.
- On phones, the sign-in page and similar screens sit centered instead of hugging the top.
- Settings no longer lists your password as a connected account you can disconnect.

### Removed

- The Edit button next to your email in Settings, which couldn't change your email yet.

## [0.23.2] - 2026-09-28

Trash, phone menus and email changes get tidier.

### Changed

- Empty Trash deletes everything in Trash at once, after you confirm.
- On phones, tapping a task in Trash opens a sheet with its full title, Restore and Delete.
- On phones, the workspace menu, Browse and Settings share one calmer list style.

### Fixed

- Changing your email in Settings now works: enter the code we send to the new address.
- The assistant on phones no longer leaves a gap under the message box.
- Tapping outside the phone + menu closes it, and lists in the workspace menu no longer hide an invisible button.
- Assistant history no longer shows the chat through it, and long titles no longer push its buttons off screen.

## [0.23.1] - 2026-09-28

Clearer error messages.

### Changed

- Errors say plainly what went wrong, with a Copy details button to send when you report a problem.

### Removed

- The Two-Factor Authentication button in Settings, which couldn't turn 2FA on yet.

## [0.23.0] - 2026-09-28

Bring Cadence into your assistant.

### Added

- Connect Claude, or another assistant that supports MCP, to read your Cadence or add thoughts to Capture.
- See your connected assistants in Settings › Integrations, and disconnect any of them in one click.
- A connected assistant can change anything Cadence's assistant can, from tasks and captures to focus views.
- Ask the assistant to manage lists, tags, captures, reminders, routines, focus views and event colours.

### Changed

- The assistant finds tasks by tag, section, priority or dates, and plans busy weeks with every task in view.

### Fixed

- The assistant checks which days you actually missed a routine instead of guessing from streaks.
- Deleting a list now says what really happens: its tasks stay, with no list.
- A duplicated task keeps its section and effort.

## [0.22.0] - 2026-09-26

Quick commands in the assistant, a clear view of your limits, and colours for events.

### Added

- Give an event a colour, like a routine.
- Type / in the assistant for quick commands: /usage, /clear, /history and /settings.
- /usage shows your assistant limits as bars, with the date each one resets.
- Clear archive deletes every archived assistant conversation at once.

### Changed

- Archive a conversation in one click from the assistant's history.
- The assistant starts answering sooner and looks things up in fewer steps.

### Fixed

- Your lists update the moment the assistant changes something, not after it finishes replying.
- Opening a task while the assistant is open shows its details on top; closing them brings the assistant back.

## [0.21.2] - 2026-09-25

The assistant can now shape your events, sections and routines.

### Added

- The assistant can add, change and delete your events, and give them an emoji.
- The assistant can add, rename, reorder and delete sections in a list, and sort tasks into them.
- The assistant can create routines, and change, pause or archive them, steps and emoji included.

## [0.21.1] - 2026-09-24

Routines can have steps: tick them off one at a time, or all at once.

### Added

- Give a routine a few steps, like water, stretch, journal, and it stays one routine.
- Tick or skip a routine's steps one by one; the day counts once every step is done or skipped.

### Changed

- Click an open task, capture, event or routine again to close its details.

## [0.21.0] - 2026-09-24

Routines get a proper home: check off any day, see your week at a glance, and shape them your way.

### Added

- Check off any past day of a routine, from the week, the month, or its history.
- Give each routine its own colour.
- Routines can repeat every few days or every other week, and be paused for a while or until a date.

### Changed

- The Routines page opens on today, with one-tap check-ins and a calmer week and month.
- On phones, tap a routine day to check it off; press and hold to skip or clear.
- Pages load and changes save faster, especially far from the US East Coast.
- Effort always shows as a battery and priority as signal bars, wherever they appear.
- Open subtasks hang under their task as an easier-to-read tree, and stay open after a reload.
- Events on Today and Upcoming sit at the top of their day and open on the Events page.

### Fixed

- The installed iPhone app fills the whole screen again.
- Skipping a routine day or checking an earlier one no longer breaks or resets its streak.
- Routine streaks count your day in your own time zone, not UTC.
- Routine reminders no longer fire after you've checked in, or on days the routine isn't due.
- Pausing a routine no longer hides the days you already checked this week.
- Today, Upcoming, Lists and tags show every task instead of stopping at 50.
- Deleting many tasks no longer brings some back, and subtasks show again in search and large lists.
- Subtasks the assistant adds show on the task right away, without reloading.
- Upcoming labels its later group "Next 7 Days" instead of "Next Week".

## [0.20.0] - 2026-09-24

Show the assistant a photo, like a whiteboard, a syllabus or a screenshot, and it turns what it sees into tasks.

### Added

- Send the assistant photos: it reads them and turns what it sees into tasks.
- Settings → Cadence Assistant shows how many photos you've sent today.

### Changed

- The subtask chip on a task turns green with a tick once every subtask is done.

### Fixed

- Assistant errors that happen before a reply starts now say what went wrong.
- On mid-size screens, the icon rail shows when the sidebar is hidden, so you can always get around.
- "No day yet" tasks in Capture show and expand their subtasks like tasks in a list.

## [0.19.0] - 2026-09-24

Hand the assistant a list and it sets everything up in one go, with one tap to approve.

### Added

- The assistant can add or change many tasks and subtasks at once, in one card.
- On phones, manage sections from a Sections button beside the board chips or a section's ⋯.

### Changed

- After you approve, the assistant keeps going, so "make a list and put these in it" happens in one go.
- Untick rows on an assistant card to leave them out; it offers the rest again.

### Fixed

- A list whose sections are all empty now shows its sections instead of "No tasks in this list".

## [0.18.3] - 2026-09-23

Small tag and task-detail tweaks.

### Changed

- Remove a tag from a task or thought by clicking it; an × appears on hover.
- List and Section in task details open a proper menu on desktop, and thought details match the task layout.

### Fixed

- The reminder time in task details no longer gets squeezed next to its switch.

## [0.18.2] - 2026-09-23

Capture keeps up with you, and Projects are now Lists: jot it, tick it off or give it a day in one move.

### Added

- Tick off anything in Capture straight away; it shows in Completed marked as a thought.
- Sort Capture by newest, oldest or priority, use Focus views, and switch between rows and a board.
- Paste several lines into Capture to add them as separate thoughts.
- Keep a thought as a note, so ideas don't have to become tasks.
- Pick a list and tags for a thought before giving it a day.
- Select several things in Capture and place or discard them together.
- "Sort these with Cadence" asks the assistant to group your thoughts; you approve each suggestion.
- Thoughts older than two weeks fold into Older, and search now finds thoughts too.
- On desktop, drag a tag from the sidebar onto a Capture row to tag it.

### Changed

- Projects are now called Lists, in the app and in the assistant.
- Capture uses Today and Upcoming's card styling, and shows a thought's tags right on its row.
- Capture's input is a lantern-lit field that glows when you type.
- Capture suggests the day you typed or your lightest day, instead of always Today.
- "Open full task editor" is now "Make it a task": no day is set and you can undo it.
- On phones, the Capture sheet stays open after each thought so you can add several in a row.
- The notification bell and Routines show unread and still-due counts, clearing as you go.

### Fixed

- New thoughts stay at the top of Capture instead of jumping to the bottom.
- "Later" keeps a thought with no day instead of using a date found in the text.
- Picking a detected date like "tomorrow at 3pm" keeps the time, and "before Friday" means the day before.
- Capture's keyboard shortcuts work, and Esc no longer erases what you typed.
- Discarding or placing a thought can be undone from the toast.
- The Capture count in the sidebar matches what's on the page.
- Text on amber buttons is dark again, so labels are readable everywhere.

## [0.18.1] - 2026-09-23

The assistant gets to the point, sounds like the voice you picked, and can explain any part of Cadence.

### Added

- Ask the assistant how anything in Cadence works or where it lives, and it explains and links you there.
- A new Full approval mode lets the assistant apply every change, permanent deletes included, without asking.

### Changed

- The assistant's four voices now sound clearly different, and it talks like a friend: short, relaxed replies.
- Asking the assistant to delete a task moves it to Trash unless you say permanently.

### Fixed

- Auto mode now waits for your tap before permanently deleting anything.

## [0.18.0] - 2026-09-23

The assistant shows its work and can edit subtasks and tags.

### Added

- Tap the assistant's "Looked a few things up" chip to see which lookups it ran.
- The assistant can edit subtasks and tags after you confirm, with tag changes marked + or − on its cards.
- In Week and Day view, whatever the current-time line passes through glows with a shimmering border.

### Fixed

- Correcting the assistant right after it adds something ("wait, 6pm") updates that item instead of adding a copy.
- The assistant knows Urgent is above High, and can see and set a task's effort level.
- The assistant no longer treats fixed blocks like classes as overdue, and sees each repeat on its own day.
- Tasks timed for late evening show on Today instead of going missing past midnight UTC.
- The time dropdown in create and edit dialogs scrolls again.
- Setting a block's end equal to its start moves the end an hour later, not 24 hours.
- Typing a time on desktop and pressing Enter keeps what you typed.

## [0.17.0] - 2026-09-23

Tags are now a real place to visit on your phone.

### Added

- On phones, each tag has its own page where you can add, rename, recolour or delete it.
- Add Cadence to your iPhone or iPad Home Screen from Safari for a full-screen app with its own icon.
- On phones, manage a project's sections from one Sections sheet.
- The assistant has an Auto mode that applies suggested changes without asking; Ask first stays the default.
- On phones, press and hold an assistant message to copy, edit or regenerate it.

### Changed

- On phones, tags are picked from a thumb-sized sheet, and projects look like Today.
- Date and time fields match everywhere: your device's pickers on touch, one calendar and time list otherwise.
- Quick Add uses the shared composer: a sheet on phones, with drafts kept per tab.
- The assistant has a fresh look: its own sigil icon, softer replies and a jump-to-latest button.

### Fixed

- Cadence no longer gets stuck loading when the assistant's last conversation was deleted.
- Reminders show as notifications in the Home Screen app on iPhone and iPad.
- Headers and the dock stay clear of the notch, status bar and home indicator.
- Tasks in a deleted section move to Unsectioned right away instead of vanishing until a refresh.
- After a reload, the assistant shows its latest replies, and read receipts show only once it starts on your message.
- On phones, tapping a tag no longer sends you back to Capture.

## [0.16.0] - 2026-09-22

Schedule on your phone opens on your day, keeps the month out of the way, and puts everything within reach.

### Added

- Swipe a task on your phone's Schedule to finish it or move it to another day, with Undo.
- Free time between plans shows as space you can tap to fill.
- "Lighten today" moves the rest of today's tasks to tomorrow or clears their dates, with Undo.
- Place ready tasks from Holding on the day you're viewing, straight from Schedule.
- A "Show fixed blocks" switch, alongside the ones for tasks and routines.

### Changed

- On phones, Month folds into your week as you scroll, and Day view shows your week above it; Week view is gone.
- On phones, Day, Month and Year zoom into each other: tap the label above the title to zoom out.
- Adding to Schedule on a phone starts with one line; "lunch with Sam fri 1pm" fills in the day and time.

### Fixed

- Days with only routines no longer show as open in Month view on phones.
- Undo right after a change no longer fails with "Task changed elsewhere".
- The assistant knows your local date and time, so "today" and "tomorrow" are right late in the evening.
- Assistant suggestion cards show the right day and include the time for timed tasks.

## [0.15.1] - 2026-09-22

Timezone-aware dates and task reliability.

### Changed

- Settings shows the time zone Cadence uses (your device's) instead of a lock option that had no effect.

### Fixed

- Dragging tasks into a new order now saves instead of failing.
- "Today" and quick due dates no longer land on the wrong day late in the evening or early morning.
- Moving a timed block on the schedule keeps it on the day you dropped it in every time zone.
- Adding a tag a task already has no longer shows an error.
- Processing the same inbox item twice no longer creates a duplicate task.

## [0.15.0] - 2026-09-21

Routines replace Habits, and Today gets a day strip.

### Added

- Today opens with a day strip of timed things, like classes and shifts.
- Routines can have an emoji, and a different time on some days, like 7:00 on Mondays.
- Repeats ask "If you miss one…": still owed (a task), let it go (a routine), or it just passes (a fixed block).
- Repeats named like a class, shift or meeting, with a start and end time, start out as fixed blocks.
- A Settings switch hides routine streaks everywhere.

### Changed

- Habits are now called Routines everywhere. Old /habits links still work.
- Today lists each routine once and folds finished ones into "2 done"; missed routines no longer pile up.
- "Needs attention" is now "Still open", in a calmer colour, and only shows when a task carries over.
- Creating a routine works like adding to the schedule, with extras under More options.

### Removed

- The Rhythms column on Today: fixed blocks moved to the day strip, and routines to the Routines list.

### Fixed

- Checking off or skipping a routine from Upcoming or Schedule updates instantly and works offline.
- Late at night, the week, day and routine views no longer jump ahead to tomorrow.

## [0.14.4] - 2026-09-21

A new phone layout, with one-tap placing.

### Changed

- The phone dock is now Capture, Schedule, the assistant, Habits and Browse.
- A workspace menu with Today, Upcoming, projects and tags opens from the left of every phone header.
- Browse opens with a profile card and one tap through to Profile & Security.
- Adding on a phone always uses the round button in the bottom-right, clear of the dock.
- Search and creation open as swipe-up sheets you can flick away, and toasts sit at the top.
- Upcoming uses the same task cards as Today, and a task's ⋮ menu is Pin, Duplicate and Trash.
- Task details can change a task's project, section and reminder.
- Place waiting captures on Today, Tomorrow or the lightest day in one tap, with Undo.
- On desktop, Capture's side panel is now a Place panel: drag tasks onto a day this week or next.
- The phone calendar follows your finger as you swipe, and long lists scroll again.

### Fixed

- A routine missed on several days now shows once under "Routines to catch up".

## [0.14.3] - 2026-09-18

A floating glass dock.

### Changed

- The phone and tablet navigation bar is now a floating glass dock, with the assistant glowing in the middle.

## [0.14.2] - 2026-09-17

A proper editor for fixed time blocks.

### Added

- Fixed time blocks get their own editor, with start and end times, weekdays, and start and end dates.
- A wrong AM or PM time can be fixed in one tap.

### Changed

- Time pickers accept any typed minute, like 2:37 PM or 14:37, and use the built-in picker on phones.
- "Not before" is now "Hide until", with a plain date picker.

### Fixed

- Editing a task's time no longer fails or shows a false "modified by another client" conflict.

## [0.14.1] - 2026-09-16

One look for headers, panels and dialogs.

### Changed

- Every page header shares one design, with a small label above the title.
- Events has its own icon in the navigation rail, and its page is simpler.

### Fixed

- Panels, cards and dialogs take their colour from your background instead of grey or navy.
- Dialogs and menus use a soft, blurred glass that matches your background.
- Phone sign-in retries before giving up, and shows a recovery message instead of spinning.

## [0.14.0] - 2026-09-16

Bottom tabs on phones, and a full notification panel.

### Added

- The notification preview expands into a full panel with search, filters, sorting and bulk clearing.

### Changed

- Phones and tablets get bottom tabs, with the assistant in the middle.
- Capture on a phone has separate tabs and an Add sheet; Focus and Controls open as sheets.
- Settings and Notifications open as swipe-down panels, with Profile & Security inside Settings.

### Fixed

- The loading screen prepares your first page before showing it, and offers recovery if loading fails.

## [0.13.0] - 2026-09-16

One shared editor for tasks, events and habits.

### Changed

- Tasks, events and habits share one editor layout that saves changes in place.
- Capture clarification uses the shared editor, keeping its suggestions and placement tools.

### Fixed

- Closing an edit panel smoothly hands its space back to the page instead of snapping.
- Editing a habit after viewing its history no longer corrupts other habit data.
- Resizing the Today and Upcoming panels no longer clips their contents or close button.
- Recurring timetables can be moved to Trash by right-clicking a calendar block.
- Photo backgrounds no longer flash when switching pages.

## [0.12.0] - 2026-09-15

Photo backgrounds, and a calmer task panel.

### Added

- Use your own photo as the background, with preview, crop, blur and brightness.
- Photo mode picks an accent for you, samples one from the image, or lets you choose your own.
- Photos are stored privately, without camera or location data.

### Changed

- Task details are grouped into Status, When, Weight and Organize, each with a short summary.
- The assistant is now called Emilie by default. If you renamed her, she keeps your name.

### Fixed

- Weekly Reset, calendar cards, notifications and Settings adapt to your background colours.
- Task panel buttons are no longer hidden, and long titles no longer get cut off on phones.

## [0.11.1] - 2026-09-13

One location setting you control.

### Added

- A Location & Weather page in Settings: choose approximate, precise, a place you pick, or none.
- "Forget saved location" removes any location kept on this device.

### Changed

- Weather and holidays share one location, using your approximate area by default.
- Weather on Home can be turned off without turning off location.

### Removed

- The "Store dismissed prompts" switch, which didn't do anything.

### Fixed

- Cadence no longer asks for your location again after you've decided.
- Signing out clears the location saved on the device.
- People elsewhere in the Americas no longer get US holidays.

## [0.11.0] - 2026-09-13

A moonlit loading screen.

### Changed

- The loading screen is a moonlit autumn valley that follows your season, theme and motion setting.
- "Captured" confirmations now appear as a regular notification.

### Fixed

- Closing Capture's side panel slides it shut instead of snapping.
- A task added from the Schedule's Day view appears right away.

## [0.10.0] - 2026-09-12

Habit fixes and cleanup.

### Removed

- The early Expo mobile prototype. Mobile will come from the same codebase as the desktop app.

### Fixed

- The version shown in Settings always matches the latest release.
- Editing, pausing or archiving a habit no longer resets its reminder, colour or mode.
- Editing an archived habit no longer brings it back.

## [0.9.1] - 2026-09-11

Under-the-hood upgrades for a faster, sturdier Cadence.

### Changed

- Cadence now runs on the latest versions of the frameworks and tools it is built on.

### Fixed

- A handful of rare glitches caught while upgrading.

## [0.9.0] - 2026-09-10

Your assistant now names conversations and shows its work.

### Added

- Conversations get a title automatically after your first message.
- See how much of your assistant allowance you have used.
- Results from the assistant's tools stay with the conversation when you come back to it.

## [0.8.1] - 2026-06-25

Assistant fixes.

### Fixed

- Bug fixes and polish for the assistant after launch.

## [0.8.0] - 2026-06-17

Meet the Cadence assistant.

### Added

- A calm assistant in the side panel that works with your real tasks and waits for your approval.
- Conversations are saved, and replies pick up where they left off after a reconnect.
- Choose the assistant's personality in Settings.

### Changed

- The sidebar and search adapt better to small screens.

## [0.7.1] - 2026-06-05

Behind-the-scenes cleanup.

### Changed

- Internal restructuring to keep Cadence reliable as it grows. Nothing looks different.

## [0.7.0] - 2026-03-26

Better themes and personalization.

### Changed

- Themes and personalization have been vastly improved.

## [0.6.0] - 2026-03-24

Events and small tweaks.

### Added

- Personal events in the calendar, plus small improvements and fixes across the app.

## [0.5.0] - 2026-03-20

Cadence understands natural language.

### Added

- Type tasks the way you'd say them, and Cadence fills in the details.

## [0.4.0] - 2026-03-19

Holding that actually holds.

### Changed

- A reworked holding page and task editor, so capturing is quick and editing is simpler.

## [0.3.0] - 2026-03-17

Task and planner improvements.

### Added

- Better all-day tasks, and refreshed Upcoming and Today pages.

## [0.2.0] - 2026-03-16

Major bug fixes.

### Fixed

- Stability fixes across the pre-release app, smoothing rough edges and regressions.

## [0.1.0] - 2026-03-15

Initial release.

### Added

- The first public Cadence beta, with the core planning experience.
