# State persistence matrix — what survives a reload, and why (REV3 #19)

> The contract for every current and FUTURE surface. When you add UI state, place it in
> this matrix deliberately — don't let it default into "resets on reload" by accident.
> Two storage owners exist; do not invent a third:
> - **`gospel-central-preferences`** (zustand-persist v4, preferences-store) — durable
>   per-user choices. Add new keys here (additive keys need no version bump).
> - **`gospel-central-booking`** (zustand-persist v1, booking-store) — calendar session
>   state worth keeping (currently ONLY `selectedAreaId`, via `partialize`).
> URL params are the third channel — for SHAREABLE state only, not device memory.
> (Since `422ced5` the mock DATA also persists per-device in `gc-mock-v1` — see CLAUDE.md.)

| Surface | State | Persists? | Where | Why |
|---|---|---|---|---|
| Calendar | View (Day/Week/Month) | ✅ | `calendarDefaultView` pref — the explicit toggle writes it | Last explicit choice = the default (same pattern as Groups) |
| Calendar | Selected church | ✅ | `gospel-central-booking` (partialize), validated against live areas on load | Users work one church at a time |
| Calendar | Selected date | ❌ deliberate | — | Yesterday restored tomorrow is wrong; always open on today (`mockNow()`) |
| Calendar | Open modal / slot | ❌ | — | Ephemeral by definition |
| Groups | View (List/3D) | ✅ | `groupsDefaultView` pref (toolbar toggle writes it) | Established pattern |
| Groups | Expansion / filters / phone-search open | ❌ deliberate | — | A fresh tree orients better than a stale 17k-px expansion |
| Contacts | View (Table/Grid/Kanban) | ✅ | `localStorage['contacts.view']` (legacy key, pre-dates the store; migrate if touched) | Layout choice |
| Contacts | Search / filters / sort | 🔗 URL only | `?q= ?stage= ?view= ?id= ?edit=` | Shareable, not device memory |
| Dashboard | Default church | ✅ | `dashboardChurchId` pref | Explicit "Set default" action |
| Dashboard | "Your Group" open | ✅ | `dashboardYourGroupOpen` pref (REV3 #18) | Collapsed by default; remembered once opened |
| Dashboard | Stat-card expansion | ❌ | — | Glanceable summary; no memory needed |
| Alerts | Toggle gates | ✅ | `notifications` prefs (Settings > Alerts) | Already durable |
| Alerts | Last-seen watermark | ✅ | `alertsLastSeenAt` pref | Powers the unread badge |
| Theme / language / time format | All | ✅ | preferences store (+ `theme` for next-themes) | Core prefs |
| Auth session | Token / user | ✅ | auth-store (`token`, `user`) + `diamond-session` cookie | Session |

## Rules

1. **A view/layout toggle persists via its `*DefaultView` pref, written by the explicit
   toggle itself** — not by programmatic navigation side-effects (e.g. month-view →
   clicking a day jumps to Day view WITHOUT changing the saved default).
2. **Dates never persist.** Snap to today on load.
3. **Rehydrated ids must be validated** against live data before use (the persisted
   church id is checked against the loaded areas; fall back to the first area).
4. **Filters that describe a QUERY belong in the URL** (shareable); device memory is for
   layout/context choices.
5. Modal/dialog/selection state is ephemeral — never persisted.
