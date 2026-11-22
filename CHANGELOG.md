# Changelog

What changed in Cadence, newest first. The in-app and website changelogs are built from this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/): MAJOR for big releases, MINOR when a feature is added, changed, or removed, PATCH for fixes and tweaks. Each release starts with a one-line summary (its title in the app), then bullets under `### Added`, `### Changed`, `### Removed`, or `### Fixed`. One change per bullet, one line each: 120 characters at most, or the build fails.

## [Unreleased]

### Fixed

- Changelog shortened

## [2.0.1] - 2026-11-22

### Changed

- Updated inner workings for better performance and stability

## [2.0.0] - 2026-11-19

Share a list with someone and work on it together, live.

### Added

- Share any list with a link and choose whether people can view it or edit it.
- Shared lists appear under Shared in the sidebar, and you get notified when someone joins.
- View-only lists show task details cleanly without any edit controls.
- Shared lists update live on everyone's screen and show who added each task.
- Tap anyone's profile picture in a shared list to view their profile.

### Changed

- Search and About now say "routines" instead of "habits", matching the rest of the app.

## [1.2.1] - 2026-11-18

In-app renaming for Focus Views.

### Fixed

- Renaming a Focus View now uses an in-app text field instead of a browser pop-up.

## [1.2.0] - 2026-11-18

Automatic list tags, one-tap routine check-ins, and a smoother transition into your workspace.

### Added

- Tasks can automatically get a tag matching their list or section, updating as they move. Turn off in Task defaults.
- Creating a tag that matches a list or section offers to tag the tasks already there, with Undo.
- Routines with multiple daily times now have a Check all button to mark the whole day done at once.

### Changed

- Opening Cadence now glides smoothly from the loading valley into your workspace.

### Fixed

- Rapid check-offs and edits to tasks, routines, lists, tags, captures, and settings no longer briefly flicker back.
- Fast startups and sign-ins no longer flicker, and the loading message only appears when loading takes longer.
- On iPhone, the loading logo appears right away and the loading screen fades out smoothly instead of snapping.
- Blank titles made only of spaces can no longer be saved, and extra spaces at the start or end are trimmed.
- The assistant no longer brings back facts you asked it to forget if the memory service was briefly offline.

## [1.1.0] - 2026-11-13

Seasonal loading scenes and a refreshed Cadence logo.

### Changed

- The loading screen landscape now features detailed mountains, wooded hills, and a warm autumn sunset.
- Each season brings its own loading scene: spring rain and mist, summer golden haze, and winter snow and lights.
- Refreshed the Cadence logo across the web, mobile, and desktop apps with cleaner lines, warmer colour, and a blossom.
- The loading screen logo now smoothly draws and blooms in a loop, replacing the three loading dots.

### Fixed

- The loading screen now shows the right season in the Southern Hemisphere.

## [1.0.0] - 2026-11-12

Cadence 1.0: Linux desktop apps, feature clips on the website, and a public What's new page.

### Added

- Cadence is now available on Linux (AppImage, .deb, and .rpm) with automatic updates, matching the Windows app.
- Each section on the Cadence website now plays a short video clip showing the app in action.
- Added a What's new page to the Cadence website so you can read every release without opening the app.

### Changed

- Expanded the website with a clearer look at what makes Cadence different, including a new section on starting fresh.
- The website now opens and closes with a continuous valley scene of moonlit peaks, a river, and a quiet hamlet.

## [0.45.3] - 2026-11-11

A quieter Events page.

### Removed

- Removed the redundant "Your Personal Events" heading above the Events list.

## [0.45.2] - 2026-11-11

Backend performance and stability.

### Fixed

- Improved backend performance and stability.

## [0.45.1] - 2026-11-11

Smoother board swiping and Capture sheet fixes on phones.

### Changed

- Swiping between board sections on a phone now tracks your finger smoothly as the next section slides into view.
- When adding a thought, the Date picker and Task switch now sit right below the text field instead of at the bottom.

### Fixed

- Long section bars on phones can be scrolled sideways again.
- Opening the Capture sheet on iPhone no longer pushes the sheet and its text box off the top of the screen.

## [0.45.0] - 2026-11-11

Collapsible list sections, board gestures on phones, and cleaner mobile sheets.

### Added

- Sections in list view can now be collapsed or expanded from the arrow beside their title, and stay how you left them.
- Swipe sideways across a board on your phone to move between its sections.
- Capture can now be viewed as a board on phones too.
- Adding a task now puts Repeat right beside its date and Tags under More options.

### Changed

- Mobile sheets now have Close on the top left and a save checkmark on the top right, removing the bottom buttons.
- Adding a task or thought now clears or closes the form immediately instead of waiting for the server.
- Removed the subtitle line under the Events page heading.
- On phones, Capture greets you with the weather in a sky tinted to the time of day, plus a cleaner empty state in New.
- Mobile creation sheets now put the type switcher in the top bar and group all date and time fields into one card.
- When creating a task, you now pick its list from a full row under More options instead of a small chip.

### Fixed

- The keyboard now opens automatically when adding a task inside a list on iPhone.
- The Capture sheet no longer pushes its text box out of view above the keyboard.
- Sheets slide closed smoothly after you add something.
- Swiping the section bar on a phone now switches to the section you land on.
- Empty date fields on phones now show clear placeholder text instead of a blank, oversized box.

## [0.44.1] - 2026-11-10

Quick ways to turn thoughts into tasks, and a faster website opening.

### Added

- Move a thought straight into a list or section from right-click or ⋮, turning it into a task with no date set.
- In Capture's board view, drag a thought to No day yet to make it a task, or drag a task back to New.

### Changed

- Columns on the Capture board now share the available width evenly.
- An animated blossom now draws itself around the final sign-up invitation at the bottom of the website.
- Every Start free button on the website now shares the same copper-tinted glass style.

### Fixed

- Turning a thought into a task no longer causes it to briefly flicker or jump back.
- The website's opening animation now starts sooner on slower phones.
- Fixed a visual gap in the illustrated branch on the website in narrow desktop windows.

## [0.44.0] - 2026-11-10

The Cadence website opens faster, especially on phones.

### Changed

- The Cadence website now loads and opens significantly faster, especially on phones.

### Fixed

- Empty steps in Weekly Reset are now properly centered on the page.
- The bottom bar in Weekly Reset now blurs scrolling content over photo backgrounds so buttons stay easy to read.
- Board columns with many tasks now scroll independently instead of stretching the whole page.
- Section drag handles now match the size, spacing, and alignment of task drag handles.

## [0.43.1] - 2026-11-10

Live startup progress and a smoother loading screen.

### Changed

- The "Preparing your workspace" text now fills in progressively as your data loads so you can see how close it is.

### Fixed

- The loading screen now transitions smoothly into your workspace without flickering, and uses less power while waiting.

## [0.43.0] - 2026-11-10

Safer sign-in, fairer assistant limits, and clearer links.

### Added

- Sign-in and verification emails now pause for a minute after too many rapid attempts to protect your account.
- If the assistant hits its app-wide daily limit, it rests until tomorrow while the rest of Cadence works normally.

### Changed

- Even in Full approval mode, the assistant always asks before deleting anything when a chat contains an image.
- Links in assistant replies now show their destination domain whenever the link text doesn't make it obvious.
- Stopping an assistant reply mid-stream now counts toward your assistant usage.

## [0.42.0] - 2026-11-09

A calmer Weekly Reset that does more of the sorting for you.

### Added

- Move back and forth between any step in Weekly Reset, and rename items directly in place.
- Added Huddle to Weekly Reset: an optional assistant chat with quick prompts to help rearrange your week.
- The end of Weekly Reset now shows your next 7 days, letting you inspect any day, task, or routine on the spot.
- Weekly Reset now pre-selects a suggested action for each item while keeping other options one tap away.
- Catch up on missed routine days—check them off or skip them—directly inside Weekly Reset.

### Changed

- Refreshed the Weekly Reset layout with cleaner copy and more breathing room on larger screens.
- Renamed the "Stabilize" step in Weekly Reset to "Loose ends".

### Fixed

- Routines now load reliably the first time you open their step in Weekly Reset.

## [0.41.5] - 2026-11-09

Seamless desktop updates.

### Changed

- Desktop updates now download with a progress bar, install automatically, and reopen Cadence with a confirmation note.

### Fixed

- On Windows, Cadence now reopens on screen after updating instead of staying hidden in the system tray.

## [0.41.4] - 2026-11-09

Smoother tag reordering.

### Changed

- Tags now animate smoothly aside as you drag to reorder them in the sidebar.

## [0.41.3] - 2026-11-09

Board scrolling and section alignment fixes.

### Fixed

- Long board columns now scroll independently instead of stretching the whole page.
- Board sections are now evenly aligned and spaced, with clearly visible drag handles.

## [0.41.2] - 2026-11-09

Inline event renaming.

### Changed

- Tap an event's title on its card to rename it in place, and Open in Schedule now shows the date it jumps to.

## [0.41.1] - 2026-11-09

Quieter page headers, consistent menus, and cleaner event cards.

### Changed

- Simplified page headers by keeping the small label above the title only on Schedule and Routines.
- Unified page ⋮ menus with a consistent layout: view switcher at the top, subtle group headers, and clean toggle rows.
- Empty days, sections, and board columns now display a clean, centered empty state.
- Simplified event cards to show the date alongside the countdown and a bell icon indicating reminder status.
- Filtering a list by tag now hides sections with no matching tasks and restores them when you clear the filter.

### Fixed

- Aligned switches, segmented controls, and rounded rows, and restored the smooth touch-press animation.

## [0.41.0] - 2026-11-09

Custom tag and section order, quick tag colours, and shareable filter links.

### Added

- Right-click any tag in the sidebar to change its colour.
- Drag tags in the sidebar to arrange them in your own order.
- Reorder sections in List and Board views by dragging them or using Move in the section menu.
- Tap a subtask's title to rename it directly on its row.
- Active sort and filter settings are now saved in the browser URL so you can bookmark or share a filtered view.

### Changed

- Tags created by the assistant now receive distinct colours instead of defaulting to grey.
- Exiting or finishing Weekly Reset now returns you to the page you came from.
- Moved the tag search button right next to the Tags heading in the sidebar.

### Fixed

- Added comfortable spacing between menu icons and their text labels.
- Menus and dropdowns now open faster, especially on phones.

## [0.40.3] - 2026-11-06

Backend stability improvements.

### Fixed

- Backend stability and performance improvements.

## [0.40.2] - 2026-11-05

More reliable live sync and reminder updates.

### Fixed

- Open devices now reconnect reliably after sleep or a dropped connection without refreshing on every screen change.
- Reminders edited or deleted during a brief server outage will no longer fire using the outdated schedule.

## [0.40.1] - 2026-11-05

Instant live sync across your open devices.

### Changed

- Changes you make on one device now appear on your other open devices right away.

## [0.40.0] - 2026-10-25

Simpler priority defaults and smarter shorthand date parsing.

### Changed

- Simplified Default priority to an optional switch that starts new tasks at Low so everything doesn't look urgent.

### Removed

- Removed manual confidence, Smart Capture, and Smart sort toggles in favour of tuned defaults that work automatically.

### Fixed

- Behaviour learning no longer treats a single unusual week as a lasting habit.
- Natural language input now recognizes shorthand like "tmrw", "fri", and "nxt wk", plus written times like "five pm".
- Typing today's weekday name (like "tuesday" on a Tuesday) now schedules for today, or next week if the time has passed.

## [0.39.0] - 2026-10-25

Effort suggestions and energy-aware planning.

### Added

- Cadence suggests a task's Effort based on similar past tasks; tap to confirm it, and daily workload uses it meanwhile.

### Changed

- Words like "asap", "important", or "no rush" set task priority automatically; the assistant never guesses priority.
- The assistant matches tasks to your energy level and only asks a follow-up question when something is unclear.
- Capture suggests lists only when confident, ignoring false urgency triggers like questions or "boss says it's urgent".

## [0.38.3] - 2026-10-23

Reminders arrive right on time, and Cadence runs lighter behind the scenes.

### Fixed

- Reminders on your devices now arrive at their exact scheduled time instead of up to a minute late.

## [0.38.2] - 2026-10-21

List view for Events and per-device sort preferences.

### Added

- Switch Events to a month-by-month list view from the page's ⋮ menu.

### Changed

- In the desktop app, moved the layout zoom control from the top header into each page's ⋮ menu.
- Sort preferences for Today, Upcoming, Lists, Routines, and Events are now remembered separately on each device.

## [0.38.1] - 2026-10-21

Custom routine ordering and consistent icons across Cadence.

### Added

- Sort routines by date added, time of day, or name from the ⋮ menu, or drag them into your own order.

### Changed

- Standardized icons everywhere: ⋮ always opens page options, and Today, Tomorrow, lists, and tags use one icon each.
- The bulk selection bar now clearly labels Trash versus Delete forever so they are easy to tell apart.

### Fixed

- Checking off a routine no longer shifts its position on the Routines page.
- Dragging a task now works reliably when grabbing directly on the drag handle icon.
- Restored the pronouns field in Profile & Security.
- Fit into today and assistant schedule previews no longer suggest time slots that have already passed.
- Retrying after a failed step suggestion no longer adds duplicate subtasks.

## [0.38.0] - 2026-10-20

Fit tasks into today's gaps, draft first steps, and search every setting.

### Added

- "Fit into today's gaps" arranges your unscheduled tasks into open time slots in one preview, with one-tap Undo.
- "Suggest steps" drafts a few starting subtasks for a task so you can add them in one tap.
- Ask the assistant to plan your day to get a one-tap schedule preview.

### Changed

- Hovering over a timed routine with a mouse now opens its check-in menu, alongside a cleaner day card design.
- Redesigned the Focus menu with a filter box at the top and clear descriptions for every preset.
- Consolidated Settings so each option lives in one home across Tasks & Routines, Appearance, and Data & Privacy.
- Searching in Settings now finds individual options like quiet hours, not just tab names.
- Unified the Keyboard Shortcuts settings page and the ? shortcut sheet so they list the exact same working shortcuts.

### Removed

- Removed unused settings toggles that had no effect, including week numbers, weekends, and default duration.

### Fixed

- Turning off "Store recent searches" now immediately clears your saved search history and stops recording new ones.

## [0.37.0] - 2026-10-19

Cadence finds a time that suits you, and offers a lighter plan when a task keeps slipping.

### Added

- "Find a time" places a task into the next open slot that fits, with options to pick another time or undo.
- Swipe a task on your phone to move it to the next available time slot later today.
- Cadence learns what times of day you prefer for different work and suggests those slots first.
- Tasks that get rescheduled repeatedly now offer to break into smaller steps, and waiting tasks offer to move to later.
- Routines can now remember how long they usually take.

### Changed

- When you assign a task to a day, the confirmation toast offers to pick a time slot for it right away.
- Basic assistant memory is now on by default for things you tell it; switch to Full or turn it off anytime.
- Assistant memory keeps all useful facts without dropping older ones, and permanently removes anything you forget.
- Updated the Full memory description in Settings to explain how it learns your preferred working hours.

## [0.36.1] - 2026-10-17

Snappier menus when using a mouse.

### Changed

- When using a mouse, menus and pickers now pop open crisply instead of expanding out of their button.

## [0.36.0] - 2026-10-17

Personal duration estimates that size your calendar blocks to match how you work.

### Added

- Tasks now show how long they usually take you, learned from your own past answers.
- Added a "Takes" row in task details to set how long a task will take.

### Changed

- New calendar blocks automatically size to how long the task usually takes, and short tasks keep their exact length.
- The Place panel now shows roughly how many hours of work each day already holds.
- Sheets and menus open and close faster and more smoothly on phones.
- On phones, pages opened from Browse now slide in smoothly, and Help & Feedback is tailored for mobile screens.

### Removed

- Task duration learning now comes only from the check-off prompt on finished tasks rather than assistant chats.

### Fixed

- The "How long did it take?" prompt now accepts time ranges and durations up to 24 hours, confirming only once saved.
- Past answers about how long tasks took are now kept instead of expiring after three months.
- Switching from Full to Basic memory no longer uses activity patterns that were learned while Full was on.

## [0.35.0] - 2026-10-17

Fluid glass menus, pull-down sheets, and dock sliding.

### Changed

- On touch screens, menus and pickers expand smoothly out of the button you tapped with translucent glass.
- Bottom sheets can now be pulled down from anywhere on the sheet and dismissed with a quick flick.
- Press and slide across the bottom navigation bar to switch between screens smoothly.
- Buttons subtly respond to your touch, and primary buttons now share the app's translucent glass finish.

## [0.34.8] - 2026-10-16

Option to start fresh assistant chats, plus smoother chat loading.

### Added

- Added an option in Settings › Assistant to start a new chat each time you open Cadence instead of resuming the last.

### Changed

- The assistant now shows a soft loading state while restoring your last chat instead of flashing a blank welcome screen.

### Fixed

- Closing the assistant panel mid-reply no longer loses the response: it finishes in the background and shows a badge.
- The "How long did it take?" prompt now closes automatically as soon as you pick an answer.

## [0.34.7] - 2026-10-16

Small layout refinements on Today and Upcoming.

### Changed

- Upcoming now shows a Details button on medium-width screens, matching Today.
- Tapping an already selected task on Today or Upcoming now closes its details panel instead of reopening it.
- Adjusted the alignment of the colour ring when creating a new list.

## [0.34.6] - 2026-10-16

Internal maintenance.

### Changed

- Internal cleanup and performance improvements.

## [0.34.5] - 2026-10-15

Profile picture hover fix.

### Fixed

- The "Change" overlay on your profile picture now appears only on hover and sits properly centered.

## [0.34.4] - 2026-10-15

Unread reply badge on the assistant icon.

### Added

- The assistant icon now shows a badge when a reply finishes while you are away from the chat.

## [0.34.3] - 2026-10-15

Truer background colours and clearer daylight accents.

### Changed

- Photo and custom backgrounds now preserve their original colours more faithfully with smoother gradient blends.

### Fixed

- Improved contrast and readability for violet buttons and accent colours in daylight mode.

## [0.34.2] - 2026-10-15

Zoomable background framing and accessibility polish.

### Changed

- Pinch or scroll to zoom in and out while framing a background photo.

### Fixed

- Undo toasts remain clickable and keyboard-accessible even while a dialog or sheet is open.
- The assistant chat stays scrolled to its newest reply as images load and respects reduced-motion settings.
- Note previews now preserve inline code formatting, and assistant memory reads note lines that begin with a number.

## [0.34.1] - 2026-10-15

Quieter, more flexible task duration prompts.

### Changed

- The "How long did it take?" prompt now accepts any custom duration and lets you fix a wrong tap with one tap.
- Cadence now asks how long a task took much less often—only when the answer will meaningfully help.

## [0.34.0] - 2026-10-14

A calmer Week view, quick right-click actions on Schedule blocks, and in-place routine check-ins.

### Added

- Right-click any Schedule block to mark it done, move it to tomorrow, pick a date, or skip and clear a routine.
- Hovering over a Schedule block previews its details and highlights the rest of its repeating series that week.
- Click a routine on Schedule to open its details for that specific day, or jump straight to it in Routines.

### Changed

- Calmer Week view: routines sit as small markers, time blocks fit their titles, and multi-day items span one bar.
- Anytime routines now sit in a single row under the all-day lane where you can check them off with one tap.
- Check off a task or routine directly from the circle on its calendar block; moved Trash to the right-click menu.
- Moved Schedule's Previous, Today, and Next buttons to the bottom right on laptops, with one unified Add button.
- Routines now use the flame icon everywhere, while the repeat arrows are reserved for repeating tasks.
- Unified the header icon buttons for Place, notifications, sort, and settings with one shared look.

### Fixed

- Schedule view toggles now keep clear labels and switch reliably beside their settings buttons.
- Fixed hour labels in Day and Week views so they align with their hour line instead of sitting one hour late.
- The Week view header date range now matches the displayed columns when your week starts on Sunday.
- Short calendar blocks and compact windows no longer cut off task titles into a blank sliver.

## [0.33.5] - 2026-10-14

Under-the-hood performance work.

### Added

- Under-the-hood performance improvements and optimizations.

## [0.33.4] - 2026-10-14

Faster assistant memory lookups and simpler MCP tools.

### Changed

- The assistant now skips extra memory lookups when all of your saved facts are already loaded.
- Connected MCP assistants can now create and update events or focus views using save_event and save_focus_view.

## [0.33.3] - 2026-10-13

Mobile keyboard spacing and iPhone date picker fixes.

### Fixed

- When the assistant hits a rate limit, it now shows a clear retry message even right after saving a task.
- Opening the date picker from the Capture sheet on iPhone no longer freezes Cadence.
- Mobile sheets now sit above the on-screen keyboard so buttons and pickers stay within reach while you type.

## [0.33.2] - 2026-10-13

Full-screen photo viewer, themed mobile pickers, and smoother narrow desktop windows.

### Fixed

- Refreshing right after sending an assistant message now reconnects smoothly once its reply stream is ready.
- Attached photos now open centered in a full-screen viewer instead of a small panel.
- On phones, dialogs open as pull-down sheets and their close button no longer overlaps the title.
- On phones, emoji and colour pickers open as themed bottom sheets and close automatically once you pick.
- Narrow desktop windows now keep the icon rail visible and open the sidebar over the page without duplicate links.

## [0.33.1] - 2026-10-13

One-tap task capture on phones and better layout detection on tall monitors.

### Added

- On phones and tablets, tap "As task" in the Capture sheet to save a thought right away as an unscheduled task.

### Fixed

- Tall, narrow desktop monitors now keep the desktop layout instead of switching to touch bottom sheets with a mouse.
- On phones, the date picker opens as a bottom sheet, and tapping "Add date" in the Capture sheet works reliably.

## [0.33.0] - 2026-10-13

Open linked apps and custom websites straight from a task or routine.

### Added

- Linked apps like Gmail, Outlook, WhatsApp, Slack, and Zoom open directly in their iPhone app, or on the web elsewhere.
- Link any website address to a task or routine so you can open it in your browser with one tap.

### Changed

- Linked apps and websites now have their own section in task and routine details with a quick Open button.

### Fixed

- Undo buttons in notification toasts now respond reliably while a task or routine is open on a phone.

## [0.33.0-0] - 2026-10-12

Go straight from a task or routine to the app you need.

### Added

- Attach an app to any task or routine and launch it with one tap from its details panel.

### Changed

- Removed the default MyFitnessPal link from all routines so you can choose it only on the routines that need it.

## [0.32.2] - 2026-10-12

Memory keeps up, however many people use it.

### Added

- Added an Open app menu to routine details with a quick link to MyFitnessPal.

### Changed

- Assistant memory learns from your chats and runs its nightly cleanup on time, even during busy hours.

## [0.32.1] - 2026-10-12

Smarter search that handles typos and word variations.

### Changed

- Search now handles typos and word variations across tasks, sections, tags, subtasks, and notes, keeping versions exact.

### Fixed

- The assistant now finds loosely named tasks and distinct version numbers without mixing up similar tasks.

## [0.32.0] - 2026-10-12

Cadence remembers, so you don't have to.

### Added

- The assistant remembers details you share so you never have to repeat yourself, with a setup choice on first open.
- "What Cadence knows" lists everything it remembers in plain words; forget any item with one tap or by asking in chat.
- Say "remember…" or "forget…" in chat and it updates immediately, with one-tap Undo.
- Ask about something you mentioned months ago and the assistant can find it across your past conversations.
- Full memory also learns how you work: when you finish tasks, what gets rescheduled, and how long things usually take.
- When turned on, Full memory reviews your last three months of chats and task notes once over a few nights.
- Added a "Don't learn from this chat" toggle to each conversation's menu.
- Connected MCP assistants can use the same memory tools whenever you have memory turned on.

### Changed

- Expanded Help & Feedback with dedicated directories for feature guides and Cadence Intelligence.
- Updated the Terms and Privacy Policy to explain assistant memory, with a prompt to review and accept the new version.
- Replaced the old on/off memory toggle in Settings with three clear choices: Off, Basic, or Full.

### Fixed

- Desktop sign-in now recovers smoothly from expired sessions and browser handoffs without needing to restart the app.

## [0.31.0] - 2026-10-12

Your captures come pre-sorted.

### Added

- Captured thoughts automatically suggest the list and section they belong in, so filing a thought takes one tap.
- "Sort all" in Capture files every thought that has a suggestion at once, with a single Undo.
- When a search finds no exact matches, Cadence suggests the task you probably meant.
- Added a "Suggest where captures go" switch in Settings › Intelligence & Privacy that turns both suggestions on or off.

### Changed

- You can now pick a section while clarifying a thought, updating automatically to match the list you choose.
- Daily workload now counts tasks without an effort estimate as busier, and weights long timed blocks by their hours.

### Fixed

- Reminders and hide-until dates typed into a thought are now kept when you place the thought as a task.
- Dismissed or snoozed missed-routine notifications no longer count toward bundled reminder alerts.
- Workload signals now use when actions actually happened, and skipped routines no longer count against you.

## [0.30.8] - 2026-10-11

Direct task capture shortcuts and clearer placement toasts.

### Fixed

- Pressing Ctrl/⌘+Enter in Capture now sends a task straight to its destination without showing it as a thought first.
- Filing a thought or task now shows its title and destination in the confirmation toast instead of just "No day yet".

## [0.30.7] - 2026-10-11

See further ahead in Upcoming and preview upcoming deadlines in Weekly Reset.

### Added

- Upcoming now shows everything ahead: tasks past this week fold under "Further out", grouped by week and then by month.
- The final step of Weekly Reset now shows how many deadlines fall in the next two weeks, with a quick link to Upcoming.

### Changed

- Type a date in Capture or pick one with the calendar button to save an entry directly as a scheduled task.
- Turning a thought into a task now confirms where it went, such as "Sun, Nov 1 · in Upcoming".
- New accounts now get a reminder the day before a deadline by default; existing accounts keep their current setting.

## [0.30.6] - 2026-10-11

More reliable iOS reminders, unread app badges, and Android home screen shortcuts.

### Added

- The installed app now reopens on the last screen you viewed if you were there within the last few hours.
- The installed app's icon now shows a badge with your unread notification count.
- On Android, long-press the Cadence app icon to jump straight to Today, Schedule, or Routines.

### Changed

- Reminders on iPhone and iPad are more reliable: iOS can now deliver them directly even when Cadence isn't open.

### Fixed

- Fixed the Cadence icon on Android so circular icon shapes no longer crop the edges.
- Tapping Reload on the "new version" banner updates the installed app in place without needing to close it first.
- Tapping a reminder for a task with no list now opens Today or Upcoming, where the task lives, instead of Capture.
- Opening a task from search or a reminder always displays its details, even if its row isn't on the current page.

## [0.30.5] - 2026-10-10

Smarter quiet-hours delivery and background tray sync on desktop.

### Fixed

- Reminders held back by quiet hours or a pause stay in the bell menu and alert once the pause ends, if still upcoming.
- The desktop app now stays in sync with your other devices while minimized to the tray, avoiding duplicate alerts.

## [0.30.4] - 2026-10-10

Longer assistant conversations and better tag and colour tools.

### Fixed

- Assistant chats now use far less of your usage limit, so you can keep chatting for much longer.
- Long assistant conversations no longer lose track of your most recent messages.
- Asking the assistant to change the colour of a list, tag, routine, or event now updates its colour properly.
- The assistant can now view and remove a task's tags by name.

## [0.30.3] - 2026-10-09

Instant Undo for deletions, quieter toasts, and frosted-glass menus.

### Changed

- Deleting a list, tag, section, routine, event, chat, or tasks in bulk now happens right away with Undo, no pop-up.
- Reduced toast clutter: toasts now appear only for deletions with Undo, errors, and background actions you can't see.
- Menus, popovers, and dropdowns now use a translucent frosted-glass finish.
- Every search box across the app now looks and behaves the same, complete with a Clear button.
- Bulk Archive now includes an Undo button that restores every task to how it was.

### Fixed

- Adding a task inside a section no longer leaves an extra gap below the field or shifts it off-center.
- Bulk Delete now gives you an Undo window instead of permanently erasing tasks with one click.

## [0.30.2] - 2026-10-08

Clarifying questions and routine reminders in the assistant.

### Added

- The assistant can now ask a clarifying question and wait for your answer when a request isn't clear.

### Fixed

- The assistant can now view, set, and update reminders on routines.

## [0.30.1] - 2026-10-08

Multiple daily times and reminders for routines.

### Added

- Routines can now have several scheduled times a day, each with its own check-off and its own reminder.

### Fixed

- Routine reminders now arrive reliably on days when you haven't checked in yet.

## [0.30.0] - 2026-10-08

Cadence feels at home on Windows.

### Added

- On Windows, right-click Cadence on the taskbar to jump straight to Quick Capture or your Schedule.
- Added Quick Capture to the system tray menu.
- Added "Reload fresh" in Settings › About for whenever something looks out of date, keeping unsynced changes safe.
- Desktop app updates now show their download progress directly on the Windows taskbar icon.

### Changed

- On Windows, the window title bar and menus now follow your active Cadence theme.
- On Windows, Cadence remembers its window size and position and resizes cleanly to fit Windows Snap layouts.
- On Windows, launching at sign-in opens Cadence quietly in the system tray when background mode is on.
- On Windows, Settings lets you know if Windows blocked Cadence from starting automatically at sign-in.
- Downloading a note in the desktop app now asks where you want to save the file.

### Fixed

- The desktop app now catches up on reminders and syncs fresh data as soon as your computer wakes from sleep.
- If a local desktop file is ever damaged by a crash, Cadence automatically restores it from the last healthy copy.

## [0.29.9] - 2026-10-08

Custom calendar start hour and streamlined time and location settings.

### Added

- Choose which hour the Day and Week calendar views open at, instead of always starting at 7 AM.
- Country, region, and time zone pickers in Settings are now searchable lists.

### Changed

- Reorganized Calendar & Time settings into Region & format, Calendar, and Show on calendar, with one-tap choices.
- Simplified Holidays and Yearly events in Settings to a single switch each, with region and Manage controls beside them.
- Streamlined Location & Weather settings into one location card, a single city row, and two plain privacy rows.

## [0.29.8] - 2026-10-08

Lower GPU usage when dialogs are open.

### Fixed

- Settings and other open dialogs no longer keep the graphics card busy while sitting idle.

## [0.29.7] - 2026-10-08

Advance alerts for calendar blocks, deadlines, and yearly events, plus notification snoozing.

### Added

- Automatic alerts before timed calendar blocks (10 minutes ahead for tasks, 30 for Fixed blocks, both adjustable).
- Optional heads-up reminder before a due date, plus a choice of how long overdue tasks stay listed.
- Yearly events can now notify you the day before or a week ahead, not only on the day itself.
- Pause all notifications for an hour or until tomorrow, and set your own morning and evening notification times.
- Routine reminders can now fire at the exact scheduled time or an hour before.

### Changed

- Moved the Routines sidebar indicator dot setting into Appearance.
- Reorganized Notification settings by what they alert, using compact chips instead of long descriptions.
- Marked the daily summary email option as upcoming while it is still in development.

### Fixed

- Turning on a task reminder now follows the deadline or opens a date and time picker instead of firing right away.

## [0.29.6] - 2026-10-07

Keep Cadence running in the Windows system tray for background reminders.

### Added

- On Windows, added an optional setting to keep Cadence in the system tray so reminders still arrive after closing it.

## [0.29.5] - 2026-10-07

Visual consistency polish.

### Fixed

- Polished spacing, borders, and visual consistency across the interface.

## [0.29.4] - 2026-10-07

Fix for a freeze after enabling notifications.

### Fixed

- Fixed the app freezing and navigation locking up right after enabling notifications.

## [0.29.3] - 2026-10-07

Manage reminder devices from anywhere and run lighter in the background on Windows.

### Added

- Settings now lists every device that can show your reminders, so you can switch any of them off remotely.
- Cadence now points out when both your desktop app and a browser on the same computer would alert you twice.

### Changed

- On Windows, Cadence now runs in Efficiency mode while in the background and returns to full speed when focused.
- Turning notifications off on a device now keeps it in your device list so you can easily turn it back on later.

## [0.29.2] - 2026-10-07

Follow-up nudges, background web notifications, and smarter natural-language rules.

### Added

- Get reminded about "Waiting on" follow-ups you scheduled and yearly events whose reminder bell is turned on.
- Enable notifications on a device and send a test alert; reminders now reach installed web apps even when closed.

### Changed

- Quiet hours now silence alerts on every device, and routine reminders use your chosen lead time.
- Due-date alerts arrive at 9:00 AM on the day, and delayed alerts are still delivered if within 15 minutes.
- Focus Views distinguish between short, easy, urgent, and demanding tasks; Deep Focus filters by effort, not priority.

### Fixed

- Allowing notifications in Settings now takes effect immediately, and blocked or unsupported browsers clearly say so.
- Dismissed and snoozed reminders no longer pop up as device alerts, and tapping a notification opens its task.
- Phrases like "not urgent", "urgent care", or "not waiting on Sam" no longer falsely set priority or waiting status.
- "Every day except weekends" now repeats on weekdays only, and unrecognized exceptions remain in the title as written.
- Moving a timed task block to another day on the calendar no longer shifts its due date along with it.
- New accounts no longer see a workload score before there is enough task history to base it on.
- Turning a thought into a task with the assistant now keeps the reminder and hide-until date you chose.

## [0.29.1] - 2026-10-07

Safer validation for repeating rules.

### Fixed

- Repeating tasks and routines now reject invalid repeat rules before they can stall the calendar or streak updates.

## [0.29.0] - 2026-10-07

Batch instructions in Weekly Reset, smarter date parsing, and relative reminders.

### Added

- In Weekly Reset, type a change for one or several tasks—including moving sections—and preview it before you apply.
- Effort suggestions based on what you picked for similar past tasks; you choose, and nothing is filled in for you.
- Typing "remind me 30 minutes before" sets a reminder that counts back from the task's scheduled start time.
- Routines, yearly events, and weekly calendar blocks now read repeat rules, times, and dates from the title you type.
- Click "Keep as written" to skip natural-language parsing for a single typed task, routine, or event.

### Changed

- Typed dates, lists, and tags now save exactly what you see, and "in the next 2 days" is suggested only as a deadline.
- Weekly Reset now converts a thought into a task in one step instead of copying it and deleting the original.

### Fixed

- Typing "in 30 minutes", "monthly report", or a quoted phrase no longer drops words or sets the wrong date.
- A second date or a date phrase Cadence can't read now stays intact in the title instead of disappearing.
- Typing "Waiting on Sam" now marks a new task as waiting and records who you're waiting on in its details.
- With a photo background, the writing room and full-screen editors now cover the page cleanly without bleed-through.

## [0.28.0] - 2026-10-06

A live-formatting writing room for task notes, with Markdown export and multi-tab sync.

### Added

- Task notes now format live as you write: bold text, lists, checklists, links, and tables appear right away.
- On phones, notes open in reading view first; tap the pencil to edit with Format and Insert panels, then ✓ when done.
- Added find and replace inside notes, plus options to copy as Markdown or download as a .md file.
- Notes show one calm save status, keeping your writing safely stored on your device until it reaches Cadence.
- A note open across two tabs updates live; edits to different parts merge automatically, and overlapping edits ask you.

### Changed

- Offline note edits that overlap with a newer version now wait in Sync review instead of being tacked onto the end.

### Fixed

- Timed deadlines now keep their time in the task's note, and the assistant no longer claims a failed change was saved.

## [0.27.2] - 2026-10-06

Assistant reliability fixes and visual polish on Upcoming and Capture.

### Fixed

- Fixed timetable blocks (like classes and shifts) no longer show a "Past Due" label.
- The Routines heading on Upcoming now matches the style of the other section headers.
- The Capture greeting now highlights your name in your chosen accent colour.
- The assistant no longer tacks stray labels like "Context" onto the end of task names.
- Attaching photos to the assistant works again in Safari and the installed web app.
- Reopening the assistant mid-reply no longer hides the latest messages.
- Retrying a failed assistant reply now keeps the changes it already made so nothing happens out of sight.

## [0.27.1] - 2026-10-06

Repeating blocks fill the whole month again, and Capture greets you with the weather.

### Added

- Clicking Sync in the desktop app now also checks for a new Cadence update.

### Changed

- Capture greets you by name with the local weather beside it (°F in the US, and a moon icon at night).
- The Capture box stays a single quiet line until you start typing, then expands to show its shortcuts.
- Capture rows now preview up to three lines of a thought and show its age only once it is 3 days old.
- Keyboard shortcut hints now show Ctrl instead of ⌘ on Windows and Linux.

### Fixed

- Repeating calendar blocks now appear across every week of Month and Year views instead of stopping after a few weeks.

## [0.27.0] - 2026-10-06

Schedule and Today are calmer to look at, and every panel stands clear of your background.

### Changed

- Lightened the loading screen's background work so your workspace opens sooner on slower devices.
- Month view summarizes repeating Fixed blocks on one line with their times, so exams and one-off tasks stand out.
- Today's Fixed strip now shows only Fixed blocks, while timed routines appear once under Routines.
- All-day items in Day view now size to their text and wrap naturally instead of filling one wide column.
- Improved contrast on cards, columns, and day cells so they stay easy to read over your own background photo.
- On Today's board view, Fixed blocks now sit in their own column with a vertical timeline.
- Simplified hiding Routines on Today to one quiet icon, and collapsing the column to a single button.
- Panels, drawers, and sections now slide smoothly when opening and closing instead of snapping.

## [0.26.5] - 2026-10-06

Cadence opens faster, especially when you come back to it.

### Changed

- Faster startup when opening Cadence, especially on repeat visits.

### Fixed

- Scheduled background jobs for reminders and maintenance now run reliably on time.
- If an assistant reply fails, reloading the page now shows a Retry button instead of making the reply look finished.

## [0.26.4] - 2026-10-06

Time zone and scheduling improvements under the hood.

### Changed

- Further under-the-hood improvements to time zone handling and task scheduling consistency.

## [0.26.3] - 2026-10-05

Dates and times land on the same day everywhere, in every time zone, all year round.

### Changed

- Time zone in Settings can now follow your device or use a fixed zone, keeping every screen and the assistant aligned.
- Due dates are now plain calendar days everywhere, while clock times are reserved for scheduled blocks and reminders.

### Fixed

- Weekly classes and other repeating time blocks now keep their wall-clock time when daylight saving time changes.
- Due dates now land on the same calendar day across the app, the assistant, and connected assistants in any time zone.
- "What's due today" and Today no longer miss tasks late in the evening or early in the morning.
- Overdue counts and workload signals no longer count past occurrences of repeating tasks and Fixed blocks as late.
- Overdue checks now run on your own local day instead of UTC, and data exports are named with your local date.

## [0.26.2] - 2026-10-05

Smarter task lookup and disambiguation in the assistant.

### Fixed

- The assistant reliably finds your lists and tasks again, retries a failed lookup once, and highlights errors in red.
- The assistant can now find a task by its list or section name, so "the comp assignment due today" gets checked off.
- When two tasks look alike, the assistant asks which one you mean, and Undo puts changed tasks back where they were.

## [0.26.1] - 2026-10-04

More reliable opt-in crash reporting.

### Fixed

- Opt-in crash reports now reach us reliably, and error details include the right app version.

## [0.26.0] - 2026-10-04

Consistent reminder sync and time-zone-safe routine calendars.

### Fixed

- Notification views now share saved reminder status and avoid duplicate database writes when opened.
- Routine calendar history stays accurate after you travel or switch time zones.

## [0.25.9] - 2026-10-04

Faster first-page startup and better photo support in the assistant.

### Changed

- Workspace startup loads less initial code and prioritizes your first page; optional diagnostics show startup timings.
- Opt-in crash reports now include error types and the app version to help diagnose crashes and failed actions.

### Fixed

- Assistant image attachments now work on browsers that cannot export WebP, including iOS Safari and installed web apps.

## [0.25.8] - 2026-10-04

Lighter offline caching and faster task saves.

### Fixed

- Offline task caching now batches requests and reuses overlapping results to reduce background loading.
- Simple task edits run fewer database queries while still protecting against conflicting changes from another device.

## [0.25.7] - 2026-10-01

A refreshed twilight landing page and faster calendar queries.

### Changed

- Refreshed the website palette with blue-mauve dusk, coral-gold light, warm branches, and peach-pink blossoms.
- Added a subtle sky tint and warm lighting across the website's feature sections for smoother transitions between them.
- Expanded the website with clearer feature walkthroughs and a redesigned Constellation section.
- Restyled the website's final sign-up invitation with frosted glass, star accents, a blossom, and a warm valley scene.
- Gave feature sections on the mobile website more breathing room as the growing branch weaves from left to right.
- Connected feature details on the mobile website into a constellation with alternating labels and companion stars.
- Made the desktop website's constellation more compact, with a richer star map, delicate orbits, and connected facets.

### Fixed

- Holiday dates now load once per year and region, making calendar navigation faster.
- Loading routine history on the calendar spends less time waiting on separate database queries.
- Background offline caching now warms a few requests at a time so it competes less with the page you're opening.
- Gave the mobile website introduction more breathing room, with its branch entering from the side below the headline.
- On phones, the website's final tree now joins the branch above it with natural limbs sweeping to the right.
- Mobile website branches now keep a consistent stroke width and meet without visible gaps.

## [0.25.6] - 2026-09-30

Account data export by email and age confirmation at sign-up.

### Added

- "Email my data" in Settings › Data & Export sends a full JSON copy of everything in your account to your email.
- Sign-up now asks you to confirm you are 16 or older and accept the Terms, including when using Google or GitHub.

## [0.25.5] - 2026-09-30

Self-serve account deletion, AGPL-3.0 open-source license, and updated Terms and Privacy Policy.

### Added

- You can now permanently delete your own account in Settings › Data & Export by typing a confirmation phrase.

### Changed

- Cadence is now open source under the AGPL-3.0 license.
- Rewrote the Privacy Policy and Terms of Service and hosted them at cadenceapp.cloud, linked from the footer and About.
- Privacy Policy and Terms of Service links now open in your browser from the profile menu, About, and Help & Feedback.

## [0.25.4] - 2026-09-30

Cleaner desktop sign-in completion and update controls on About.

### Changed

- The desktop "Sign-in complete" browser tab now matches the sign-in card, complete with the logo and a soft entrance.
- Desktop update controls now live on the redesigned About page, showing a "Last checked" time and a cleaner prompt.

## [0.25.3] - 2026-09-30

Desktop sign-out fix.

### Fixed

- Signing out on the desktop app now completes cleanly instead of flickering between screens and leaving you signed in.

## [0.25.2] - 2026-09-30

Desktop update button and social sign-in fixes.

### Fixed

- Clicking Update in the desktop header now opens the install dialog directly instead of only opening Settings.
- Signing in to the desktop app with Google or GitHub no longer fails on the first try with an "already used" error.

## [0.25.1] - 2026-09-30

Finer desktop zoom steps and a cleaner header.

### Changed

- On desktop, interface zoom now runs from 75% to 150% in thirteen steps, adjustable from the header or Appearance.

### Removed

- Removed the "Up to date" pill from the desktop header; sync alerts still show in the banner, and Sync is in the rail.

## [0.25.0] - 2026-09-30

Pick the loading screen's season, and enjoy a faster, lighter assistant.

### Added

- Choose your preferred loading screen season in Settings › Appearance, or leave it on Auto to follow the calendar.

### Changed

- Softened the loading screen with a quieter logo glow, gentler lanterns and drifting leaves, and mistier clouds.
- The assistant now responds faster and uses less of your allowance while keeping every tool and capability.

### Fixed

- Connecting to Wi-Fi with a login page (like hotels or cafés) or briefly losing connection no longer signs you out.

## [0.24.0] - 2026-09-28

Cadence keeps working without an internet connection and catches up when you're back online.

### Added

- Cadence opens offline on phones and desktop, showing your recent weeks and the weeks ahead.
- Tasks, subtasks, notes, tags, lists, and Trash all work offline, marking unsynced changes with a small cloud icon.
- Changes that can't sync are listed in Sync review with the reason, so you can retry or discard each one.
- A brief notice lets you know when you go offline and when you're back online.
- On Android, changes made offline finish syncing in the background even after you close the app.
- A notice with a one-tap Reload button appears whenever a new version of Cadence goes live.
- Add or reset your password from Settings using an emailed code, even if you signed up with Google or GitHub.

### Changed

- On phones, every page header now matches Schedule's layout, and icon-only buttons share one glass outline.
- On phones, the month calendar in Schedule folds and unfolds smoothly as you swipe.

### Fixed

- A weak internet connection no longer drops your edits or signs you out; changes wait safely and sync when connected.
- Offline changes no longer sync twice or leak into another account after switching accounts.
- Errors in Profile & Security, such as a wrong password, now show a clear message instead of getting stuck on Saving.
- On phones, the sign-in screen and related pages now sit centered instead of hugging the top edge.
- Settings no longer lists your email password as a connected third-party account you can disconnect.

### Removed

- Removed the placeholder Edit button next to your email in Settings until email verification was ready.

## [0.23.2] - 2026-09-28

Empty Trash in one go, change your email address, and browse cleaner phone menus.

### Changed

- "Empty Trash" permanently deletes everything in Trash at once, after asking you to confirm.
- On phones, tapping a task in Trash opens a bottom sheet showing its full title alongside Restore and Delete.
- On phones, the workspace menu, Browse, and Settings now share one calm, consistent list style.

### Fixed

- Changing your email address in Settings now works: enter the verification code sent to your new address.
- Removed an unwanted blank gap below the assistant's message box on phones.
- Tapping outside the mobile + menu now closes it, and lists in the workspace menu no longer hide an invisible button.
- The assistant's history drawer no longer bleeds the chat through, and long titles no longer push buttons off screen.

## [0.23.1] - 2026-09-28

Clearer error messages with copyable details.

### Changed

- Error notices now explain what went wrong in plain words, with a "Copy details" button for reporting a problem.

### Removed

- Removed the non-functional Two-Factor Authentication button in Settings until 2FA support is ready.

## [0.23.0] - 2026-09-28

Connect external AI assistants to Cadence through MCP.

### Added

- Connect Claude or any MCP-compatible assistant to read your schedule, manage tasks, or add thoughts to Capture.
- View your connected external assistants in Settings › Integrations and disconnect any of them in one click.
- A connected assistant can work with everything Cadence's in-app assistant can, from tasks and captures to focus views.
- Ask the assistant to manage lists, tags, captures, reminders, routines, focus views, and event colours.

### Changed

- The assistant can now find tasks by tag, section, priority, or dates, and sees your full week when planning busy days.

### Fixed

- The assistant now checks which days you actually missed a routine instead of guessing from your streak count.
- Deleting a list now clearly states what happens: its tasks are kept and simply become unlisted.
- Duplicating a task now preserves its section and effort level.

## [0.22.0] - 2026-09-26

Quick slash commands in the assistant, a clear view of your usage limits, and custom colours for events.

### Added

- Give any personal event its own colour, just like a routine.
- Type / in the assistant for quick commands: /usage, /clear, /history, and /settings.
- The /usage command shows your assistant limits as progress bars along with the date each one resets.
- "Clear archive" deletes all archived assistant conversations at once.

### Changed

- Archive any conversation in one click directly from the assistant's history list.
- The assistant begins replying sooner and looks up your workspace context in fewer steps.

### Fixed

- Your lists update the moment the assistant changes something, without waiting for its reply to finish typing.
- Opening a task from the assistant now shows its details on top, and closing them brings the assistant right back.

## [0.21.2] - 2026-09-25

The assistant can now create and organize your events, list sections, and routines.

### Added

- The assistant can add, edit, and delete your personal events, including picking an emoji.
- The assistant can add, rename, reorder, and delete sections in a list, and move tasks into them.
- The assistant can create routines and edit, pause, or archive them, complete with steps and an emoji.

## [0.21.1] - 2026-09-24

Routines can have steps: check them off one at a time, or all at once.

### Added

- Give a routine a checklist of steps—like water, stretch, and journal—while keeping it all as one routine.
- Check off or skip a routine's steps one by one; the day counts as complete once every step is done or skipped.

### Changed

- Click an already open task, thought, event, or routine a second time to close its details panel.

## [0.21.0] - 2026-09-24

Routines get a proper home: check off any past day, see your week at a glance, and shape them your way.

### Added

- Check off any past day of a routine from the week strip, the month calendar, or its history view.
- Give each routine its own custom colour.
- Routines can now repeat every few days or every other week, and can be paused indefinitely or until a chosen date.

### Changed

- The Routines page now opens focused on today, with one-tap check-ins and calmer week and month views.
- On phones, tap a routine day to check it off, or press and hold to skip or clear it.
- Pages load and edits save faster worldwide, especially far from the US East Coast.
- Effort always appears as a battery icon and priority as signal bars, everywhere in the app.
- Expanded subtasks now sit under their task in a clearer tree layout and stay open after a page reload.
- Personal events on Today and Upcoming now sit at the top of their day and open on the Events page when clicked.

### Fixed

- The installed Home Screen app on iPhone fills the entire screen again.
- Skipping a routine day or checking off an earlier day no longer breaks or resets your streak.
- Routine streaks now count days in your local time zone instead of UTC.
- Routine reminders no longer fire after you've already checked in, or on days the routine isn't scheduled.
- Pausing a routine no longer hides the days you already checked off earlier that week.
- Today, Upcoming, Lists, and tag pages now display all of your tasks instead of stopping at 50.
- Deleting many tasks quickly no longer causes some to reappear, and subtasks show reliably in search and large lists.
- Subtasks added by the assistant now appear on the task immediately without needing a reload.
- Upcoming now labels its later group "Next 7 Days" instead of "Next Week".

## [0.20.0] - 2026-09-24

Show the assistant a photo—like a whiteboard, syllabus, or screenshot—and it turns what it sees into tasks.

### Added

- Send photos to the assistant: it reads them and turns what it finds into structured tasks for your approval.
- Settings › Cadence Assistant now shows how many photos you have sent today.

### Changed

- The subtask counter chip on a task now turns green with a checkmark once every subtask is complete.

### Fixed

- If the assistant hits an error before its reply starts, it now explains what went wrong instead of failing silently.
- On medium-sized screens, hiding the sidebar now keeps the compact icon rail visible so you can always get around.
- Unscheduled ("No day yet") tasks in Capture now display and expand their subtasks just like tasks in a list.

## [0.19.0] - 2026-09-24

Hand the assistant a list of work and it sets everything up in one go, with one tap to approve.

### Added

- The assistant can now create or update many tasks and subtasks at once inside a single approval card.
- On phones, manage sections from a Sections button beside the board chips or from any section's ⋯ menu.

### Changed

- After you approve a step, the assistant automatically continues multi-step requests like "make a list and add these".
- Uncheck any rows on an assistant approval card to leave them out and apply only the items you want.

### Fixed

- A list whose sections are all empty now displays its section headers instead of saying "No tasks in this list".

## [0.18.3] - 2026-09-23

Quick tag removal and cleaner dropdowns in task details.

### Changed

- Remove a tag from a task or thought by clicking it; an × icon appears on hover.
- List and Section fields in task details now open custom menus on desktop, and thought details match the task layout.

### Fixed

- The reminder time field in task details is no longer squeezed tightly against its toggle switch.

## [0.18.2] - 2026-09-23

Capture keeps up with you, and Projects are now Lists: jot it, check it off, or schedule it in one move.

### Added

- Check off items directly inside Capture; finished items appear in Completed marked as a thought.
- Sort Capture by newest, oldest, or priority, use Focus Views, and switch between list rows and a board.
- Paste several lines into Capture to add them as separate thoughts at once.
- Mark a thought as a reference note so ideas can stay in Capture without becoming tasks.
- Pick a list and tags for a thought before deciding which day to schedule it.
- Select multiple items in Capture to schedule, file, or discard them together.
- "Sort these with Cadence" asks the assistant to group your loose thoughts, letting you approve each suggestion.
- Thoughts older than two weeks automatically fold under Older, and global search now finds thoughts too.
- On desktop, drag a tag from the sidebar onto any Capture row to tag it.

### Changed

- Renamed Projects to Lists everywhere in the app and in the assistant.
- Capture now uses the same card styling as Today and Upcoming, showing a thought's tags right on its row.
- Redesigned Capture's input box as a warm lantern-lit field that glows as you type.
- Capture now suggests the day mentioned in your text or your lightest upcoming day instead of always picking Today.
- Replaced "Open full task editor" with "Make it a task", creating an unscheduled task with one-tap Undo.
- On phones, the Capture sheet stays open after saving a thought so you can jot down several in a row.
- The notification bell and Routines icon now display badges for unread notifications and routines still due today.

### Fixed

- Newly added thoughts stay at the top of Capture instead of jumping to the bottom.
- Choosing "Later" keeps a thought unscheduled instead of applying a date word found in its text.
- Picking a detected date like "tomorrow at 3pm" preserves the time, and "before Friday" schedules for Thursday.
- Keyboard shortcuts in Capture work reliably again, and pressing Esc no longer erases what you typed.
- Discarding or placing a thought can now be undone directly from the confirmation toast.
- The Capture count badge in the sidebar now stays in sync with what is on the page.
- Restored dark text on amber buttons so labels remain easy to read in every theme.

## [0.18.1] - 2026-09-23

The assistant gets to the point, sounds like the voice you picked, and can explain any part of Cadence.

### Added

- Ask the assistant how any Cadence feature works or where a setting lives to get a plain explanation and a direct link.
- Added a Full approval mode that lets the assistant apply every change, including permanent deletes, without asking.

### Changed

- The assistant's four voices now sound clearly distinct, using a warmer, more concise conversational style.
- Asking the assistant to delete a task now moves it to Trash unless you specifically ask to delete it permanently.

### Fixed

- In Auto approval mode, the assistant still waits for your confirmation before permanently deleting anything.

## [0.18.0] - 2026-09-23

The assistant shows its lookups, edits subtasks and tags, and highlights your current calendar block.

### Added

- Tap the assistant's "Looked a few things up" chip to see which searches and lookups it ran.
- The assistant can now edit subtasks and tags after you confirm, marking tag additions and removals with + or −.
- In Week and Day calendar views, any block touching the current-time line glows with a soft highlighted border.

### Fixed

- Correcting the assistant right after it adds an item (like "wait, 6pm") updates that item instead of duplicating it.
- The assistant now knows Urgent ranks above High priority, and can read and set a task's effort level.
- The assistant no longer treats fixed blocks like classes as overdue tasks, and sees repeating items on the right days.
- Tasks scheduled for late evening now stay on Today instead of disappearing after midnight UTC.
- The time dropdown list in creation and edit dialogs can be scrolled again.
- Setting a calendar block's end time equal to its start time now moves the end one hour later instead of 24 hours.
- Typing a custom time on desktop and pressing Enter now saves what you typed.

## [0.17.0] - 2026-09-23

Tags get their own page on phones, iOS Home Screen support, and an Auto mode for the assistant.

### Added

- On phones, every tag now has its own page where you can view its tasks, rename it, change its colour, or delete it.
- Add Cadence to your iPhone or iPad Home Screen from Safari for a full-screen app with its own icon.
- On phones, manage all of a project's sections from a single Sections bottom sheet.
- Added an Auto mode for the assistant that applies changes without asking first, while "Ask first" remains the default.
- On phones, press and hold any assistant message to copy, edit, or regenerate it.

### Changed

- On phones, tags are picked from a compact bottom sheet, and project pages now match Today's card layout.
- Unified date and time fields: native pickers on touch screens, and a single shared calendar and time menu on desktop.
- Quick Add now uses the unified composer—opening as a bottom sheet on phones—and keeps your draft per tab.
- Refreshed the assistant with its own emblem icon, softer message bubbles, and a jump-to-latest button.

### Fixed

- Cadence no longer gets stuck loading if the assistant's most recent conversation was deleted.
- Reminders now arrive as notifications when Cadence is installed to the Home Screen on iPhone and iPad.
- Headers and the bottom dock now stay clear of the screen notch, status bar, and home indicator.
- Tasks in a deleted section now move to Unsectioned right away instead of disappearing until you refresh.
- Reloading the app now shows the latest assistant replies right away, and read indicators wait until work begins.
- On phones, tapping a tag now opens that tag instead of sending you back to Capture.

## [0.16.0] - 2026-09-22

Schedule on your phone opens on your day, folds the month out of the way, and puts everything within thumb reach.

### Added

- Swipe a task on your phone's Schedule to complete it or move it to another day, with one-tap Undo.
- Free time between scheduled items on phones now shows as open space you can tap to fill.
- "Lighten today" moves the rest of today's tasks to tomorrow or clears their dates in one tap, with Undo.
- Place ready tasks from Holding onto the day you are viewing directly from the Schedule page.
- Added a "Show fixed blocks" toggle alongside the calendar visibility switches for tasks and routines.

### Changed

- On phones, Schedule now centers on Day view with a collapsible week and month strip above it, replacing the Week grid.
- On phones, navigate between Day, Month, and Year views by tapping a date to zoom in or the header label to zoom out.
- Adding to Schedule on a phone starts with a single line where typing "lunch with Sam fri 1pm" fills in day and time.

### Fixed

- Days that only contain routines no longer appear as completely open in Month view on phones.
- Tapping Undo right after an edit no longer fails with a "Task changed elsewhere" error.
- The assistant now uses your local date and time so "today" and "tomorrow" stay accurate late in the evening.
- Assistant suggestion cards now display the right local day and include the clock time for timed tasks.

## [0.15.1] - 2026-09-22

Time-zone-aware dates and reliable drag-and-drop ordering.

### Changed

- Settings now shows the active time zone from your device instead of a lock toggle that had no effect.

### Fixed

- Dragging tasks into a new order now saves reliably instead of failing.
- "Today" and quick-pick due dates no longer land on the wrong day late in the evening or early in the morning.
- Moving a timed block on the schedule keeps it on the day you dropped it in every time zone.
- Adding a tag that a task already has no longer triggers an error message.
- Turning the same captured thought into a task twice no longer creates a duplicate task.

## [0.15.0] - 2026-09-21

Routines replace Habits, Today gets a committed-time strip, and repeats adapt to what happens when you miss one.

### Added

- Today now opens with a day strip at the top for committed time blocks like classes and shifts.
- Routines can now have a custom emoji and different scheduled times on specific days of the week.
- Repeating items now ask "If you miss one…": still owed (a task), let it go (a routine), or it passes (a fixed block).
- Repeating items with start and end times named like a class, shift, or meeting automatically start as fixed blocks.
- Added a switch in Settings to hide routine streaks everywhere in the app.

### Changed

- Renamed Habits to Routines across the entire app (existing /habits links still work automatically).
- Today lists each due routine once and folds finished ones into a "done" summary so missed routines never pile up.
- Renamed "Needs attention" to "Still open" in a calmer colour, appearing only when an unfinished task carries over.
- Creating a routine now works just like adding to Schedule, with extra settings tucked under More options.

### Removed

- Replaced the Rhythms column on Today: fixed blocks live in the top day strip, and routines sit in their own section.

### Fixed

- Checking off or skipping a routine from Upcoming or Schedule now updates immediately and works offline.
- Late at night, the Week, Day, and Routines views no longer jump ahead to tomorrow before local midnight.

## [0.14.4] - 2026-09-21

A new mobile layout with bottom sheets and one-tap task placement.

### Changed

- Updated the phone navigation dock to Capture, Schedule, the assistant, Habits, and Browse.
- Added a workspace menu in the top-left of every phone header for quick access to Today, Upcoming, projects, and tags.
- Browse on phones now opens with your profile card and one-tap access to Profile & Security.
- Adding items on a phone now always uses a floating button in the bottom right, clear of the navigation dock.
- Search and item creation on phones open as swipe-up sheets you can flick closed, and toasts appear at the top.
- Upcoming now uses the same task cards as Today, and simplified each task's ⋮ menu to Pin, Duplicate, and Trash.
- You can now change a task's project, section, and reminder directly inside the task details panel.
- Place waiting captures onto Today, Tomorrow, or your lightest upcoming day in one tap, with Undo.
- On desktop, Capture's side panel is now a Place panel where you can drag tasks onto any day this week or next.
- The phone calendar now follows your finger smoothly as you swipe, and long task lists scroll properly again.

### Fixed

- A routine missed across several days now appears just once under "Routines to catch up".

## [0.14.3] - 2026-09-18

A floating glass dock on phones and tablets.

### Changed

- Redesigned the phone and tablet navigation bar as a floating glass dock with the assistant glowing in the center.

## [0.14.2] - 2026-09-17

A dedicated editor for fixed time blocks and more flexible time pickers.

### Added

- Fixed time blocks now have their own editor with start and end times, weekdays, and active date ranges.
- Flip a time between AM and PM in a single tap.

### Changed

- Time pickers now accept any typed minute (like 2:37 PM or 14:37) and use the built-in system picker on phones.
- Renamed "Not before" to "Hide until" with a simpler date picker.

### Fixed

- Editing a task's scheduled time no longer fails or triggers a false "modified by another client" conflict.

## [0.14.1] - 2026-09-16

Unified headers, background-tinted glass panels, and a simpler Events page.

### Changed

- Every page header now shares one consistent design with a small label above the title.
- Added a dedicated Events icon to the navigation rail and simplified the Events page.

### Fixed

- Panels, cards, and dialogs now take their surface tint from your active background instead of plain grey or navy.
- Dialogs and menus now use soft, blurred frosted glass that blends with your background.
- Signing in on a phone now retries automatically on slow connections and shows a recovery button instead of spinning.

## [0.14.0] - 2026-09-16

Bottom navigation tabs on phones and an expandable notification panel.

### Added

- The notification menu now expands into a full panel with search, filters, sorting, and bulk clearing.

### Changed

- Phones and tablets now use bottom navigation tabs with the assistant right in the middle.
- Redesigned Capture on phones with separate tabs and an Add sheet, while Focus and page controls open as bottom sheets.
- Settings and Notifications now open as swipe-down panels on phones, with Profile & Security inside Settings.

### Fixed

- The loading screen now prepares your opening page before fading out, and offers a retry button if loading fails.

## [0.13.0] - 2026-09-16

One shared editor for tasks, events, and habits.

### Changed

- Tasks, events, and habits now share a single editor layout that saves changes automatically in place.
- Clarifying a capture now uses the shared editor while keeping its smart suggestions and placement tools.

### Fixed

- Closing an edit panel now animates smoothly as it hands its space back to the page instead of snapping.
- Editing a habit after viewing its history no longer overwrites data on other habits.
- Resizing the Today and Upcoming panels no longer clips their contents or hides the close button.
- Repeating timetable blocks can now be moved to Trash by right-clicking them on the calendar.
- Custom photo backgrounds no longer flash when switching between pages.

## [0.12.0] - 2026-09-15

Custom photo backgrounds and a cleaner, grouped task details panel.

### Added

- Use your own photo as the workspace background, with live controls for preview, crop, blur, and brightness.
- Photo mode can pick an accent colour for you, sample one from your image, or let you choose your own.
- Uploaded background photos are stored privately with camera and location metadata stripped out.

### Changed

- Organized task details into Status, When, Weight, and Organize sections, each with a short summary.
- The assistant is now named Emilie by default; if you already chose a custom name, yours is kept.

### Fixed

- Weekly Reset, calendar cards, notifications, and Settings now adapt their colours to match your background.
- Action buttons in the task panel stay visible on small screens, and long titles no longer get cut off on phones.

## [0.11.1] - 2026-09-13

One clear location setting that you control.

### Added

- Added a Location & Weather page in Settings: choose approximate area, precise location, a city you pick, or off.
- "Forget saved location" removes any location data stored on your device.

### Changed

- Weather and regional holidays now share a single location setting, using your approximate area by default.
- Weather on the home greeting can now be turned off without turning off your location for holidays.

### Removed

- Removed the "Store dismissed prompts" switch in Settings, which had no effect.

### Fixed

- Cadence no longer asks for location permission again after you have already made a choice.
- Signing out now clears any location saved on the device.
- People outside the United States in the Americas no longer receive US public holidays by default.

## [0.11.0] - 2026-09-13

A moonlit autumn valley on the loading screen.

### Changed

- The loading screen is now an illustrated moonlit valley that adapts to your season, theme, and motion setting.
- "Captured" confirmations now appear as standard notification toasts.

### Fixed

- Closing Capture's side panel now slides it shut smoothly instead of snapping.
- Tasks added directly from the Schedule's Day view now appear on the calendar immediately.

## [0.10.0] - 2026-09-12

Habit reliability fixes and codebase cleanup.

### Removed

- Retired the separate Expo mobile prototype so mobile and desktop come from one shared codebase.

### Fixed

- The version number shown in Settings now always matches the latest release.
- Editing, pausing, or archiving a habit no longer resets its reminder, colour, or tracking mode.
- Editing an archived habit no longer accidentally unarchives it.

## [0.9.1] - 2026-09-11

Under-the-hood framework upgrades for a faster, sturdier Cadence.

### Changed

- Upgraded Cadence to the latest versions of its core frameworks and build tools.

### Fixed

- Resolved a handful of rare edge-case glitches uncovered during the upgrade.

## [0.9.0] - 2026-09-10

Your assistant now names conversations automatically and keeps its tool results in view.

### Added

- Assistant conversations automatically get a descriptive title after your first message.
- See how much of your assistant usage allowance you have used in Settings.
- Action cards and lookup results from the assistant stay saved with the conversation when you return to it.

## [0.8.1] - 2026-06-25

Post-launch assistant fixes and polish.

### Fixed

- Bug fixes and reliability polish for the assistant following its initial launch.

## [0.8.0] - 2026-06-17

Meet the Cadence assistant.

### Added

- Added a calm side-panel assistant that works with your real tasks and waits for your approval before making changes.
- Conversations are saved automatically, and streaming replies pick up where they left off if your connection drops.
- Choose the assistant's personality and tone in Settings.

### Changed

- The navigation sidebar and search dialog now adapt more cleanly to smaller screens.

## [0.7.1] - 2026-06-05

Behind-the-scenes architecture cleanup.

### Changed

- Internal code restructuring to keep Cadence fast and reliable as it grows, with no visual changes.

## [0.7.0] - 2026-03-26

Richer themes and workspace personalization.

### Changed

- Expanded and refined themes, colour palettes, and personalization options across the app.

## [0.6.0] - 2026-03-24

Personal events on your calendar and everyday polish.

### Added

- Track personal events on your calendar, alongside small improvements and fixes across the app.

## [0.5.0] - 2026-03-20

Cadence understands natural language as you type.

### Added

- Type tasks the way you would naturally say them, and Cadence automatically fills in dates, times, and details.

## [0.4.0] - 2026-03-19

A faster Holding inbox and a simpler task editor.

### Changed

- Reworked the Holding page and task editor so capturing loose thoughts is quick and editing details is simpler.

## [0.3.0] - 2026-03-17

Better all-day tasks and refreshed Today and Upcoming views.

### Added

- Improved all-day tasks and refreshed the layout of the Today and Upcoming pages.

## [0.2.0] - 2026-03-16

Early beta stability and bug fixes.

### Fixed

- Stability fixes across the pre-release app, smoothing out rough edges and early regressions.

## [0.1.0] - 2026-03-15

Initial public beta release.

### Added

- Launched the first public Cadence beta with the core capture, daily planning, and scheduling experience.
