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
| Build / PWA | Vite + `vite-plugin-pwa` |
| Backend | Firebase (Auth, Firestore, Hosting) |
| Styles | CSS Modules + design tokens |
| Dates | `date-fns` + `date-fns-tz` |
| Forms | `react-hook-form` + Zod |
| Tests | Vitest |

---

## Status

### Done
- Repository created with `.gitignore` (environment files, internal docs and real Firestore rules are excluded)
- Product decisions: app name **Eventa**, Google sign-in restricted to a single UID (allowlist)
- **Firestore data model designed:** `items` (event + embedded subtask tree + embedded recurrence rule), `placements` (put on a day), `occurrences` (deterministic ids, only stored when changed), `days` (day note + completion log); no composite indexes required

### Pending
- **Phase 0 — Foundations:** scaffold, folder structure, design tokens, icons, i18n, Firebase + Google Auth, Firestore rules with UID allowlist, responsive layout (tab bar / sidebar)
- **Persistence services** for the data model
- **Recurrence engine** (rules, occurrences, exceptions) with tests
- **Subtask tree** (view + editor + paste list)
- **Event form** and recurrence editor
- **Events list** and adaptive event detail
- **Today view** (no-time list, schedule, overdue items, day log)
- **Put on a day**, occurrence actions, edit scope, drag to move/resize
- **Calendar** (month / week / day)
- **Streaks**, 14-week heatmap, past occurrence editing, day note, empty states
- Mobile polish and scenario testing

---

## Setup

> Detailed instructions will be added once the project is scaffolded.

Requirements: Node.js 20+, a Google account, and the Firebase CLI (`npm install -g firebase-tools`).

---

## Security

- Zero credentials in the repo — everything goes through `.env` (see `.env.example`)
- Firestore rules use a **UID allowlist**, so only the owner can read or write data
