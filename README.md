# Eventa

A personal, mobile-first time manager for a single user. A **calendar with a daily schedule**
is the core, and **everything is an event**: one-off tasks, projects with unlimited nested
subtasks, recurring habits with streaks, and time blocks (like office hours).

Built on Firebase (Auth, Firestore, Hosting — free Spark plan) with React + TypeScript + Vite.

---

## Stack

| Area | Technology |
|---|---|
| Framework | React + TypeScript |
| Build | Vite |
| Backend | Firebase (Auth, Firestore, Hosting) |
| Styles | CSS Modules + design tokens |
| Dates | Own helpers (local `YYYY-MM-DD` keys) |
| Validation | Zod |
| Tests | Vitest |

---

## Status

### Done
- Repository created with `.gitignore` (environment files, internal docs and real Firestore rules are excluded)
- Product decisions: app name **Eventa**, Google sign-in restricted to a single UID (allowlist)
- Project scaffold: Vite + React + TypeScript (strict), Vitest, oxlint, Firebase config, Firestore rules template with UID allowlist
- **Recurrence engine** (daily, weekdays, every N days, every N weeks, week cycles; start/end/count; pauses) with tests for the spec scenarios
- **Subtask tree logic**: unlimited depth, check/uncheck propagation, progress, paste-list parsing, per-occurrence templates
- **Day agenda logic**: occurrences (moved, skipped, time overrides), placements, side-by-side schedule layout, streaks, completion rate, heatmap
- **Firestore services**: items, placements, occurrences and day log (batched writes, offline-first)
- **UI foundations:** design tokens from the mockup, icons, i18n (Spanish), Google sign-in, responsive layout (bottom tab bar < 860 px, sidebar with pinned events ≥ 860 px), contextual ＋ button, offline banner, toasts
- **Today view:** pending from previous days, "no time" list, schedule with current-time line, day log and day note
- **Schedule:** side-by-side overlaps, background blocks, tap an empty slot to add, drag to move and resize (long press on mobile)
- **Calendar:** month grid with completion bar, week view with timeline, day view
- **Events list:** category filter with counts, search, "show finished", automatic tags, progress and today's checkbox
- **Event detail:** adaptive view (one-off / repeating / time block), subtask tree with filters, subtask panel, stats, heatmap, exceptions
- **Single event form** with subtask tree editor (Enter / Tab / Shift+Tab / drag / paste list), when, completion and more options
- **Modals:** add to day, recurrence editor with preview, put on a day, occurrence actions, edit scope, ⋯ menu, move subtask, past occurrence, delete confirmation, completed prompt, reschedule, day note
- Unit tests for the day agenda and schedule layout, plus smoke tests that render every screen and modal with sample data (61 tests in total)
- **Today fits the screen:** the schedule scrolls inside its own card instead of the whole page (lists on top take up to ~40% on mobile)
- **Subtask editor works without a keyboard:** ⇤ / ⇥ level buttons on every row, ＋ adds a subtask inside, tree guide lines and bold parents; guide lines in the detail tree too
- **Installable on Android/iPhone:** web app manifest (standalone, opens at Today) and app icons
- **Getting started guide** ([GETTING_STARTED.md](GETTING_STARTED.md)): Firebase project, `.env`, rules, hosting and phone install, step by step
- **Deployed to Firebase Hosting** and verified on desktop and phone (Google sign-in, data saved to Firestore)
- **Firestore data model designed:** `items` (event + embedded subtask tree + embedded recurrence rule), `placements` (put on a day), `occurrences` (deterministic ids, only stored when changed), `days` (day note + completion log); no composite indexes required

### Pending
- Manual testing of the spec scenarios in the real app
- Mobile polish after testing

---

## Setup

Full walkthrough: **[GETTING_STARTED.md](GETTING_STARTED.md)**. Short version:

Requirements: Node.js 20+, a Google account, and the Firebase CLI (`npm install -g firebase-tools`).

1. Create a Firebase project (free Spark plan): enable **Authentication → Google**, create a **Firestore** database in production mode and register a **web app**.
2. `cp .env.example .env` and fill in the web app config.
3. `npm install` and `npm run dev`. Sign in once.
4. Copy your **User UID** (Firebase Console → Authentication → Users), create `firestore.rules` from `firestore.rules.example` with your UID, then deploy the rules: `firebase deploy --only firestore:rules,firestore:indexes`.
5. Deploy: `npm run build && firebase deploy --only hosting`, and add the hosting domain to Auth's authorized domains.

Scripts: `npm run dev`, `npm run build`, `npm test`, `npm run lint`.

---

## Security

- Zero credentials in the repo — everything goes through `.env` (see `.env.example`)
- Firestore rules use a **UID allowlist**, so only the owner can read or write data
