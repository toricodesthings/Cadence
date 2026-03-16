# Cadence UI Refinement 11

## Purpose

This document is the second-phase frontend assessment for Cadence and is limited to design quality, UI/UX, accessibility, responsiveness, readability, and interface feel.

This is not a redesign plan.

The goal is to make the existing product language production-ready while staying inside the north star defined in `docs/Design Manifesto.md`:

- calm
- structured
- very readable
- elegant
- neurodivergent-friendly
- atmospheric
- cozy
- explicitly not generic SaaS

---

## Verification Basis

### Primary references

- `docs/Design Manifesto.md`
- `apps/frontend/app/app.css`
- `apps/frontend/app/components/MainLayout.tsx`
- `apps/frontend/app/components/sidebar/Sidebar.tsx`
- `apps/frontend/app/components/sidebar/IconRail.tsx`
- `apps/frontend/app/components/shared/ResizableSidePanel.tsx`
- `apps/frontend/app/components/tasks/TaskCard.tsx`
- `apps/frontend/app/routes/home.tsx`
- `apps/frontend/app/routes/schedule.tsx`
- `apps/frontend/app/components/calendar/ScheduleHeader.tsx`
- `apps/frontend/app/components/calendar/CalendarGrid.tsx`
- `apps/frontend/app/routes/habits.tsx`
- `apps/frontend/app/components/habits/HabitsCanvas.tsx`
- `apps/frontend/app/components/habits/HabitItem.tsx`
- `apps/frontend/app/routes/weekly-review.tsx`
- `apps/frontend/app/root.tsx`

### Chrome DevTools MCP verification

The authenticated app was inspected programmatically in Chrome DevTools MCP on the main protected routes:

- `/`
- `/schedule`
- `/habits`
- `/weekly-review`
- `/auth/sign-in`
- `/auth/sign-up`

Viewport presets checked:

- `1920x1080`
- `1440x900`
- `1280x800`
- `1024x768`
- `768x1024`
- `375x812`

Verification included:

- accessibility tree snapshots
- route navigation while authenticated
- responsive shell inspection
- keyboard sampling on planner
- Lighthouse accessibility pass on protected planner
- file-level verification against the rendered behavior

### What was observed directly in DevTools

- The protected routes now render and can be inspected live.
- Planner, Schedule, and Habits all keep the desktop navigation architecture mounted at narrow sizes instead of shifting to a phone/tablet pattern.
- Weekly Reset keeps the emotional tone best on desktop, but loses orientation context on smaller widths.
- The auth wrapper is closer to the manifesto than the default Neon UI, but the embedded auth module still reads as a foreign component system inside Cadence.
- The mobile sign-up surface still overflows vertically at `375x812`.
- The document title is still empty on protected routes.
- Duplicate notification live regions are present.
- Planner task cards still expose nested interactive controls inside a clickable card container.
- Many core controls remain under the 44x44 touch target floor.
- No hard keyboard trap was found in sampled tabbing, but focus order is shell-heavy and the planner card structure is not clean.

---

## Executive Verdict

Cadence has the right visual language, but the protected app is not yet production-ready from a UI quality standpoint.

The visual direction itself is not the problem. The main issues are structural:

1. The authenticated shell is still desktop-first.
2. Typography and muted contrast rules are not being enforced consistently.
3. Interaction density and touch target sizing break the “calm sanctuary” feel on smaller screens.
4. Accessibility semantics are incomplete in core flows.

The work should focus on refinement, reduction, and responsive adaptation, not invention.

---

## Anti-SaaS Verdict

Pass on tone.

Cadence does not read like a generic SaaS dashboard. The palette, glow restraint, rounded geometry, and Weekly Reset ritual framing all support the manifesto.

Fail on production polish.

When the shell compresses, the experience starts to feel like a desktop utility squeezed smaller rather than a composed sanctuary adapting gracefully. That is the current gap.

---

## Manifesto Compliance Summary

### Strongly aligned

- Twilight Sanctuary palette is established correctly in `apps/frontend/app/app.css:11-80`.
- `Sora` and `Outfit` are loaded correctly in `apps/frontend/app/root.tsx:15-20`.
- Weekly Reset desktop presentation best matches the intended emotional register.
- Planner and schedule avoid sterile dashboard cards and hard-edge admin styling.

### Currently violated

- The contrast floor declared in `apps/frontend/app/app.css:1-5` is not being upheld in many route components.
- The manifesto’s mobile-first section is not reflected in the app shell. The rail, sidebar, and side-panel model stay mounted too long.
- Quiet typography is frequently pushed into faint typography.
- Several controls are too small to feel calm or accommodating.
- The manifesto says third-party UI must be fully re-skinned, especially auth surfaces. The current auth experience still presents a Neon-style inner card, generic auth copy, and foreign information hierarchy inside Cadence’s outer shell.

---

## Priority 0: Shell Stability and Accessibility Baseline

### 1. Rebuild the authenticated shell around responsive layout modes

Severity: Critical

Observed impact:

- On planner mobile, the navigation rail, expanded navigation panel, main content, and side calendar are all still part of the same shell.
- On schedule mobile, the month grid is compressed instead of transformed.
- On habits mobile, the fixed left structure consumes width before the weekly canvas can breathe.

Implementation targets:

- `apps/frontend/app/components/MainLayout.tsx:86-136`
- `apps/frontend/app/components/sidebar/Sidebar.tsx:68-100`
- `apps/frontend/app/components/shared/ResizableSidePanel.tsx:15-94`
- `apps/frontend/app/routes/home.tsx:97-125`
- `apps/frontend/app/routes/habits.tsx:81-199`

Plan:

1. Define four explicit shell modes: wide desktop, laptop, tablet portrait, phone.
2. Replace shell-wide `h-screen` plus `overflow-hidden` in `MainLayout.tsx:88-129` with a route-safe `min-h-dvh` model and deliberate per-surface scrolling.
3. Keep the left rail persistent only on wide desktop.
4. Convert the expanded sidebar into:
   - collapsible panel on laptop
   - drawer or sheet on tablet portrait
   - hidden-by-default navigation on phone
5. Convert right-side detail panels into:
   - persistent panel on wide desktop
   - optional overlay/drawer on laptop
   - full-screen or bottom-sheet detail on tablet/phone
6. Add safe-area handling for top and bottom interactive regions per manifesto mobile guidance.

Acceptance criteria:

- No route mounts both a persistent left navigation structure and a persistent right side panel at `768x1024` or `375x812`.
- Main reading/work column remains comfortable at `1024x768`.
- No protected route depends on horizontal squeezing to remain functional.

### 2. Establish a hard minimum interaction standard

Severity: Critical

Observed impact:

- Planner DevTools sampling showed 77 undersized interactive elements on the authenticated shell.
- Rail links render at `36x36`.
- Header collapse button renders at `32x32`.
- Habit check controls render at `40x40`.
- Mobile Weekly Reset exposes an unlabeled icon-only button in the accessibility tree.

Implementation targets:

- `apps/frontend/app/app.css:232-235`
- `apps/frontend/app/components/MainLayout.tsx:98-109`
- `apps/frontend/app/components/sidebar/IconRail.tsx:141-258`
- `apps/frontend/app/components/habits/HabitItem.tsx:35-48`
- `apps/frontend/app/routes/weekly-review.tsx:74-86`

Plan:

1. Raise the global icon-button floor from `36px` to a true `44px` minimum.
2. Normalize all header, rail, and quick-action controls to that floor.
3. Add explicit accessible names to icon-only buttons that currently rely on hidden text disappearing at smaller breakpoints.
4. Audit every protected route for finger reach and target separation on touch screens.

Acceptance criteria:

- No primary or secondary interactive control falls below `44x44`.
- No icon-only button is unnamed in Lighthouse or DevTools.
- Controls remain visually delicate without becoming physically undersized.

### 3. Fix the document-level accessibility gaps before visual micro-polish

Severity: Critical

Observed impact:

- `document.title` is empty on protected routes.
- Duplicate notification live regions are present on route surfaces.
- Planner task cards expose nested interactive controls inside a clickable card wrapper.

Implementation targets:

- `apps/frontend/app/root.tsx:22-47`
- `apps/frontend/app/components/tasks/TaskCard.tsx:154-280`

Plan:

1. Implement route-level titles and descriptions so every protected page has a usable page title and sensible metadata.
2. Deduplicate live regions so the app only exposes the minimum status infrastructure needed.
3. Refactor planner task cards so the card is either:
   - one semantic container with distinct child buttons
   - or one primary button/link without nested button descendants
4. Re-run Lighthouse after the semantics pass, before visual refinements continue.

Acceptance criteria:

- Protected routes expose correct page titles.
- Duplicate live regions are removed.
- Planner cards pass button-name and nested-interactive checks.

---

## Priority 1: Typography, Readability, and Contrast

### 4. Enforce the manifesto contrast floor as a real system rule

Severity: High

Observed impact:

- `apps/frontend/app/app.css:1-5` explicitly forbids dropping below the twilight contrast floor.
- Core route files still use muted variants like `/60`, `/70`, and lower for active information.
- Habits empty-state secondary copy and planner metadata are especially faint on dark surfaces.

Implementation targets:

- `apps/frontend/app/routes/home.tsx:25-33`
- `apps/frontend/app/components/calendar/ScheduleHeader.tsx:96-105`
- `apps/frontend/app/components/habits/HabitsCanvas.tsx:35-40`
- `apps/frontend/app/components/habits/HabitsCanvas.tsx:57-64`
- `apps/frontend/app/routes/weekly-review.tsx:61-65`

Plan:

1. Treat the contrast floor comment in `app.css` as a blocking rule, not guidance.
2. Remove low-opacity muted text from core information, not just body copy.
3. Keep “quiet” reserved for support text, never for primary orientation, dates, active filters, or CTA labels.
4. Re-test contrast against twilight surfaces after each route pass.

Acceptance criteria:

- Essential labels, timestamps, orientation cues, and empty-state instructions meet WCAG AA.
- No critical route information depends on faint opacity for its tone.

### 5. Reassign font roles so `Outfit` feels intentional, not decorative noise

Severity: High

Observed impact:

- `Outfit` is sometimes used on tiny uppercase utility labels.
- Planner route hierarchy is split awkwardly between a tiny shell `h1` and a larger conversational `h2`.
- Route identity and reading priority are inconsistent.

Implementation targets:

- `apps/frontend/app/components/MainLayout.tsx:111-115`
- `apps/frontend/app/routes/home.tsx:25-33`
- `apps/frontend/app/routes/home.tsx:157-163`
- `apps/frontend/app/components/calendar/CalendarGrid.tsx:81-89`
- `apps/frontend/app/routes/weekly-review.tsx:269-277`

Plan:

1. Reserve `Outfit` for page titles, section titles, ritual moments, and selected display emphasis.
2. Keep `Sora` on metadata, controls, dates, navigation labels, and dense reading.
3. Reduce uppercase micro-label dependence across Planner and Schedule.
4. Make each route’s first visual heading the true first reading target.

Acceptance criteria:

- Users can tell what to read first within two seconds.
- `Outfit` appears sparingly and purposefully.
- Small labels stop carrying emotional or structural burden.

---

## Priority 2: Route-Specific Refinement Plans

### 6. Planner

Severity: Critical

Observed in DevTools:

- Mobile snapshot still exposes the full application navigation before the planner workspace.
- `1024x768` behavior compresses the list and right-side calendar into an uncomfortable center strip.
- Keyboard order begins in the rail and walks through shell chrome before the main planning work.
- Task cards still use a clickable card wrapper with nested action controls.

Implementation targets:

- `apps/frontend/app/routes/home.tsx:97-125`
- `apps/frontend/app/routes/home.tsx:121-217`
- `apps/frontend/app/components/tasks/TaskCard.tsx:154-280`

Plan:

1. Collapse or relocate the right calendar/detail surface below desktop widths.
2. Rework the planner header so the view toggle no longer relies on centered absolute positioning upstream in `MainLayout`.
3. Give the list mode a single dominant reading column at laptop and below.
4. Refactor task cards for cleaner semantics, larger action affordances, and calmer metadata.
5. Reduce micro-label use in section headers and secondary toggles.

Acceptance criteria:

- Planner remains fully usable at `1024x768`, `768x1024`, and `375x812`.
- The list column retains a readable width without competition from a persistent side panel.
- Task actions remain clear without creating nested-button semantics.

### 7. Calendar Scheduler

Severity: Critical

Observed in DevTools:

- Mobile schedule keeps the icon rail and a full 7-column month grid.
- Header controls and CTA compete for width instead of reflowing.
- Month view compresses to the point that day labels and cell affordances are too small to be calm or scannable.

Implementation targets:

- `apps/frontend/app/routes/schedule.tsx`
- `apps/frontend/app/components/calendar/ScheduleHeader.tsx:89-174`
- `apps/frontend/app/components/calendar/CalendarGrid.tsx:78-123`

Plan:

1. Give Schedule its own responsive choreography rather than inheriting the desktop shell intact.
2. Break the schedule header into stacked zones on tablet/phone:
   - title/context
   - navigation
   - view toggle
   - add-task action
3. Replace month-grid compression with mode adaptation on smaller screens:
   - default to week/day on phone
   - allow month as a secondary mode, not the forced first view
4. Protect day-cell tappability and label clarity before preserving full density.

Acceptance criteria:

- `375x812` does not show a cramped month spreadsheet as the first mobile schedule experience.
- Add Task remains fully visible and easy to reach.
- Schedule keeps its calm rhythm without shrinking the grid into noise.

### 8. Habits

Severity: Critical

Observed in DevTools:

- Mobile habits keeps the desktop rail and weekly table layout.
- The 7-column weekly header compresses too aggressively.
- The empty state is tonally correct but too faint and cramped on narrow widths.
- Habit completion controls are close to target size but still below the preferred floor.

Implementation targets:

- `apps/frontend/app/routes/habits.tsx:81-199`
- `apps/frontend/app/components/habits/HabitsCanvas.tsx:25-140`
- `apps/frontend/app/components/habits/HabitItem.tsx:35-48`

Plan:

1. Create a narrow-width habits mode that stops treating the route as a fixed weekly matrix.
2. Preserve the weekly rhythm, but shift the phone presentation toward a stacked or horizontally paged pattern that keeps each day legible.
3. Increase the contrast and size of empty-state guidance.
4. Raise habit completion controls to the global touch target floor.
5. Ensure archived/active toggle and Add Habit CTA reflow without crowding.

Acceptance criteria:

- Week labels and day markers remain readable at `375x812`.
- A first-time user can understand how to add or complete a habit without squinting or hunting.
- The route remains soft and spacious even when empty.

### 9. Weekly Reset

Severity: High

Observed in DevTools:

- This route is the strongest emotional reference on desktop.
- On smaller widths, the step rail collapses into icon-only state and loses textual orientation.
- Mobile accessibility tree exposes an unlabeled button before the main ritual content.

Implementation targets:

- `apps/frontend/app/routes/weekly-review.tsx:24-89`
- `apps/frontend/app/routes/weekly-review.tsx:249-395`

Plan:

1. Keep Weekly Reset as the tone benchmark for the product.
2. Preserve its ritual pacing on desktop, but replace the shrinking left rail with a mobile/tablet progress pattern that keeps step meaning visible.
3. Add an explicit accessible name to the small-screen exit/back control.
4. Protect the route from becoming icon-only at the exact moment orientation matters most.

Acceptance criteria:

- Step context remains clear on tablet and phone.
- The route keeps its ceremonial calm without sacrificing orientation or accessibility.
- Weekly Reset continues to be the emotional benchmark other routes borrow from.

### 10. Auth Surface and Embedded Neon Module

Severity: Critical

Observed in DevTools:

- Desktop sign-in presents a Cadence glass panel containing a second, more generic inner auth card.
- Sign-up at `375x812` overflows vertically.
- Auth inputs and buttons render at `36px` height, with the password visibility control still below the touch target floor.
- The auth surface still has an empty document title.
- Lighthouse on auth reported missing document title, missing meta description, missing main landmark, and non-sequential heading order.
- The auth switch CTA appears in the accessibility tree as a link containing a button.
- Copy such as `Welcome`, `Sign In`, and `Or continue with` still reads like default provider UI rather than Cadence voice.

Implementation targets:

- `apps/frontend/app/routes/auth.tsx:9-87`
- `apps/frontend/app/app.css:314-374`
- `apps/frontend/app/root.tsx:22-47`

Plan:

1. Treat auth as a first-class Cadence room, not a skinned third-party insert.
2. Remove the double-card perception created by the outer glass container plus the Neon module’s inner boxed form.
3. Reconcile the heading structure so the page has one clear primary identity and one support sentence, instead of competing `Welcome` and provider-generated auth headings.
4. Raise every auth input, provider button, submit button, and visibility control to the same `44x44` interaction floor used elsewhere in the refinement.
5. Fix mobile sign-up vertical overflow and ensure the full sign-up flow fits at `375x812` without awkward clipping or compressed footer copy.
6. Replace or override generic provider-module copy so the auth tone sounds like Cadence rather than a default auth widget.
7. Eliminate nested link/button semantics in the sign-in/sign-up switcher and any similar vendor-generated affordances.
8. Add route titles and descriptions so auth is not invisible to the browser, assistive tech, and SEO layer.
9. Ensure the auth module feels materially consistent with the rest of Cadence:
   - one surface language
   - one spacing system
   - one typography hierarchy
   - no foreign border logic

Acceptance criteria:

- Sign-in and sign-up feel native to Cadence rather than embedded Neon UI.
- No auth control falls below `44x44`.
- The auth screen has a valid title, description, and landmark structure.
- Mobile sign-up fits cleanly within `375x812`.
- The auth surface respects the manifesto’s anti-SaaS and third-party re-skin requirements.

---

## Priority 3: Visual Consistency and Layout Performance

### 11. Reduce nested scrolling and compression-driven layout behavior

Severity: Medium

Observed impact:

- The shell relies on multiple `overflow-hidden` and internal scroll containers.
- Right-side panels and fixed grids stay mounted even when the available width collapses.
- This creates a brittle feeling and increases the likelihood of clipped content, invisible overflow, and expensive repaints around large blurred surfaces.

Implementation targets:

- `apps/frontend/app/components/MainLayout.tsx:88-129`
- `apps/frontend/app/components/shared/ResizableSidePanel.tsx:59-93`
- `apps/frontend/app/routes/home.tsx:121-233`
- `apps/frontend/app/routes/habits.tsx:85-179`

Plan:

1. Reduce shell-level clipping and let routes own their scroll model.
2. Avoid keeping full-height desktop side surfaces mounted where they are not visible or useful.
3. Limit large-area blur stacks where simpler atmospheric layering will do.
4. Re-test planner and habits for clipped focus rings, clipped dropdowns, and hidden overflow after the shell pass.

Acceptance criteria:

- No route depends on stacked hidden-overflow containers to stay composed.
- Focus rings, popovers, and sheets are never clipped by shell containers.
- The layout feels lighter because the structure is simpler, not because text gets fainter.

### 12. Tighten primitive consistency before polishing individual pages

Severity: Medium

Observed impact:

- Button sizing and spacing are inconsistent between shell, dialogs, and route headers.
- Some dialogs still use small close affordances and generic centered modal behavior that conflicts with the manifesto’s mobile guidance.

Implementation targets:

- `apps/frontend/app/components/primitives/Dialog.tsx:21-55`
- `apps/frontend/app/app.css:232-235`

Plan:

1. Normalize icon-button, ghost-button, and header-action sizing across the protected app.
2. Ensure dialogs and overlays have a mobile sheet strategy where appropriate.
3. Keep primitives atmospheric, but make their behavior more predictable and easier to use.

Acceptance criteria:

- The same action type has the same visual weight and tap area across routes.
- Overlays feel like part of one system, not route-specific improvisations.

---

## Positive Findings to Preserve

These should be protected during refinement:

- Weekly Reset’s desktop atmosphere and pacing.
- The twilight background system in `app.css`.
- The decision to avoid heavy dashboard cards.
- The restrained amber accent usage.
- The planner’s conversational header tone once it is paired with stronger hierarchy.
- The auth page’s atmospheric left-side narrative, once the embedded module stops fighting it.

---

## Implementation Order

1. Fix shell responsiveness and panel strategy.
2. Fix touch targets, naming, titles, and live-region duplication.
3. Enforce contrast and font-role rules globally.
4. Refine Planner.
5. Refine Schedule.
6. Refine Habits.
7. Refine Weekly Reset small-screen orientation.
8. Rebuild the auth surface so the Neon module no longer leaks third-party UI.
9. Re-run Chrome DevTools MCP verification at all required viewports.
10. Re-run Lighthouse on the protected planner and on both auth routes.

---

## Final Verification Checklist

The refinement should not be considered complete until all of the following are true:

- All four protected routes are usable at `1920x1080`, `1440x900`, `1280x800`, `1024x768`, `768x1024`, and `375x812`.
- No route shows clipped controls, hidden primary actions, or persistent desktop side architecture on phone.
- Route titles are present.
- Contrast passes WCAG AA for essential text.
- No icon-only control is unnamed.
- No core interaction is below `44x44`.
- No nested interactive semantics remain in planner task cards.
- Sign-in and sign-up feel native, readable, and fully usable at phone size.
- Weekly Reset still feels like the emotional benchmark.
- The product still reads as Cadence, not SaaS.
