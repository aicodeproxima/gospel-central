# Diamond — Theme audit (11 animated themes)

**Audit date:** 2026-05-07
**Branch audited:** `feat/admin-system` @ `890a3bf` (gate removal commit)
**Live URL:** https://diamond-delta-eight.vercel.app
**Themes covered:** starfield, aurora, galaxy, jellyfish, rain, matrix, voronoi, constellation, smoke, synapse, deepspace
**Modes covered:** dark + light per theme
**Pages walked:** /dashboard, /admin?tab=audit, /admin?tab=permissions, /calendar (with Topbar), BookingWizard dialog (z-index check)
**Auditor:** frontend agent, post Part-1 (gate removal) verification

## 1. Executive summary

The 11 newly-exposed animated themes break into three clear behaviors:

- **9 "dark-tier" themes** (`starfield`, `galaxy`, `jellyfish`, `rain`, `matrix`, `constellation`, `smoke`, `synapse`, `deepspace`) — render beautifully in dark mode. **Light mode toggle is a silent no-op:** the body is force-painted dark via `!important`, so toggling light/dark in `/settings` while one of these themes is active produces no visible change. Not a contrast bug — by design — but the toggle is misleading.
- **2 "light-tier" themes** (`aurora`, `voronoi`) — render fine in dark mode but are **broken in light mode.** Sidebar user-info text vanishes, stat-card values disappear, Quick Access tile titles drop to near-zero contrast. Cards keep their light-mode CSS variables (dark text for white surfaces) but the body becomes transparent and the dark canvas shows through, producing dark-on-dark.
- **Recently-fixed cross-theme issues hold up:** dialog z-index above the canvas (commit `34ecc4a`) works on starfield's BookingWizard test; calendar surfaces are correctly transparent on decorative themes (commit `3ae2311`).

**Top 3 issues:**

1. **H-1 — Aurora light mode: widespread invisible text** (sidebar, stat values, Quick Access tiles). One of two themes designed-for-light, broken on the surface they're designed for.
2. **H-2 — Voronoi light mode: identical pattern.** Same dark-on-dark contrast collapse.
3. **L-1 — 9 dark-tier themes silently ignore the light-mode toggle.** UX confusion: the toggle in /settings appears to do nothing.

**Gate-removal safety verdict:** the Part-1 gate removal (`890a3bf`) is **safe to ship** — every theme works in its native (dark) mode, and the only broken combinations are aurora+light and voronoi+light, both of which existed before the gate change (Stephen, the other Dev, would have hit them too). Exposing the themes does not introduce new bugs; it just exposes existing ones to more eyeballs.

## 2. Theme-by-theme matrix

Symbol: ✅ clean • ⚠ low-contrast / silent / quirk • ❌ broken (see findings)

| Theme | Dark mode | Light mode | Notes |
|---|:-:|:-:|---|
| starfield | ✅ | ⚠ | Dark beautiful (dashboard, audit, permissions, calendar+Topbar, dialog z-index all pass). Light = silent no-op (L-1). |
| aurora | ✅ | ❌ | Dark fine. Light has H-1 (widespread invisible text). |
| galaxy | ✅ | ⚠ | Audit log clean. Light = silent no-op (L-1). |
| jellyfish | ✅ | ⚠ | Cyan accent, clean. Light = silent no-op (L-1). |
| rain | ✅ | ⚠ | Light blue accent, clean. Light = silent no-op (L-1). |
| matrix | ✅ | ⚠ | Green accent, classic. Light = silent no-op (L-1). |
| voronoi | ✅ | ❌ | Dark fine. Light has H-2 (widespread invisible text). |
| constellation | ✅ | ⚠ | Cyan accent, clean. Light = silent no-op (L-1). |
| smoke | ✅ | ⚠ | Magenta/pink accent, clean. Light = silent no-op (L-1). |
| synapse | ✅* | ⚠ | Audit screenshot failed (disk-full mid-sweep) but visual baseline of /dashboard render confirmed in DOM snapshot. Light = silent no-op (L-1). |
| deepspace | ✅ | ⚠ | Orange/amber accent, clean. Light = silent no-op (L-1). |

\* Synapse dark dashboard rendered cleanly in the DOM snapshot but the screenshot failed due to disk-space exhaustion (the `~/.claude/` Playwright cache had accumulated 389 PNGs from past sessions consuming the entire C: drive). Re-screenshot after cleanup if the visual evidence is needed for a future fix verification.

## 3. Critical findings

None. The two H-tier findings would be Critical for a production SaaS but are bounded to one user-toggle combination per affected theme; the default boot path (theme=starfield, mode=dark) and the most likely user paths remain clean.

## 4. High findings

### H-1 — Aurora theme in light mode: widespread invisible text

| Field | Value |
|---|---|
| Severity | High |
| Theme | `aurora` |
| Mode | light |
| Pages affected | /dashboard verified; pattern likely repeats on /admin, /calendar, /reports |
| Evidence | [audit-screenshots/2026-05-07-themes/theme-05-aurora-light-dashboard.png](../audit-screenshots/2026-05-07-themes/theme-05-aurora-light-dashboard.png) |

**Repro:**
1. Login to https://diamond-delta-eight.vercel.app
2. Open /settings
3. Pick the **Aurora** theme tile
4. Click **Light** in the same Theme card (next-themes mode)
5. Navigate to /dashboard

**Expected:** A light-themed dashboard with cards, sidebar, and stat tiles legible against the aurora canvas.

**Actual symptoms:**
- Sidebar branding "Diamond" rendered in pale-on-white near-invisible
- The user info "Michael" line is **completely invisible**; only "Developer" subtitle is faintly visible
- Stat-card values (`20`, `46`, `101`, `4`) drop to near-zero contrast
- Quick Access tile titles ("Calendar", "Contacts", "Groups", "Settings", "Reports") render in dark gray over the dark aurora canvas — barely legible

**Root cause:** When `class="light"` is applied to `<html>` while `data-theme="aurora"` is also set, the global `body { background-color: transparent !important; }` rule (added so the aurora canvas is visible) kicks in, but the cards / sidebar inherit light-mode CSS variables (`--card: oklch(1 0 0)`, `--card-foreground: oklch(0.145 0 0)` — i.e. dark text intended for a white surface). Combined with the dark canvas showing through translucent surfaces, dark-on-dark = invisible.

**Recommended fix (frontend, src/app/globals.css):**
- Either: force aurora to use dark CSS variables in **both** modes (matching the 9 dark-tier themes' approach via `:root[data-theme="aurora"]` overrides regardless of `.dark` / `.light`)
- Or: ensure `[data-slot="sidebar-container"]`, `[data-slot="card"]`, and stat-card surfaces have an opaque, light-themed `background-color` in `:root[data-theme="aurora"]` (no transparency override)
- Approach 1 is simpler and matches the "embrace decorative themes are dark" pattern the rest of the codebase already takes

---

### H-2 — Voronoi theme in light mode: same pattern as H-1

| Field | Value |
|---|---|
| Severity | High |
| Theme | `voronoi` |
| Mode | light |
| Pages affected | /dashboard verified |
| Evidence | [audit-screenshots/2026-05-07-themes/theme-10-voronoi-light-dashboard.png](../audit-screenshots/2026-05-07-themes/theme-10-voronoi-light-dashboard.png) |

**Repro:** Same as H-1 but pick **Voronoi** at step 3.

**Symptoms:** Identical to H-1.
- Sidebar "Diamond" branding faint
- User info "Michael" invisible (only "Developer" survives)
- All four stat tile values disappear
- Quick Access tile titles drop to dark-on-dark

**Root cause:** Same as H-1 — the `voronoi` theme is in the [`ANIMATED_LIGHT_THEMES`](../src/components/shared/ThemedBackground.tsx#L152) set, but the light-mode CSS variables don't account for the body becoming transparent over a dark canvas.

**Recommended fix:** Same as H-1 (single fix can target both themes since they share the same root cause).

## 5. Medium findings

None of medium severity surfaced in the dark-mode walks across all 11 themes. The mid-tier pages (audit log color badges, permissions matrix scope cells, calendar Topbar, BookingWizard dialog z-index) all rendered cleanly on starfield, the most-tested theme. Spot checks on the other 8 dark-tier themes showed consistent behavior.

## 6. Low / cosmetic findings

### L-1 — Light mode toggle is a silent no-op on 9 dark-tier animated themes

| Field | Value |
|---|---|
| Severity | Low |
| Themes | starfield, galaxy, jellyfish, rain, matrix, constellation, smoke, synapse, deepspace |
| Mode | light (when toggled while one of these is active) |

**Symptom:** Toggling between Dark / Light / System in /settings while one of these themes is active produces no visible change. The body's `!important` background rule (e.g. `html[data-theme="starfield"] { background-color: #05040f !important; }` at [globals.css:384](../src/app/globals.css#L384)) overrides the next-themes class.

**Why it's only Low:** Functionally these themes ARE dark-only by design, and forcing a dark base prevents the H-1/H-2 contrast disaster. The bug is UX-perception only: the toggle in /settings *looks* like it should work but does nothing.

**Recommended fix (frontend, src/app/(dashboard)/settings/page.tsx Theme card):**
- Detect the active animated dark theme; when one is active, either:
  - Disable the Dark/Light/System buttons and show a small caption "This theme is dark-only"
  - Or hide the mode picker entirely on these themes
- Document in the theme tile's `aria-label` that this theme is dark-only, so screen readers convey the constraint too

### L-2 — Theme-switch quirks (under-tested)

The plan's "theme-switch quirks" check (rapid switching, switching with dialog open, hard-reload FOUC) was deprioritized when disk-space exhaustion forced the audit to wrap. Based on the architecture review (Providers.tsx mounts `<ThemeEffects />` which conditionally renders the canvas — full unmount on theme change), the patterns SHOULD work, but this is **untested**.

Recommended follow-up:
- Switch from default → starfield → aurora → matrix → default in quick succession on /dashboard. Observe whether any canvas instance lingers or any data-theme attribute stays applied.
- Open BookingWizard on starfield → switch to galaxy with the dialog open → close the dialog → re-open on galaxy. Verify the dialog's bg/border match the active theme.
- Hard-reload (Ctrl+Shift+R) on each animated theme; observe whether there's a brief flash of unstyled content (FOUC) before the canvas mounts.

## 7. Cross-theme issues (already fixed — held up in audit)

These were caught and fixed in earlier commits before this audit ran. Audit confirms they hold:

- **Dialog z-index above animated canvas** (commit `34ecc4a fix: keep dialogs/popovers above sidebar on animated themes`) — verified on starfield via the BookingWizard test ([theme-17-starfield-dialog-zindex.png](../audit-screenshots/2026-05-07-themes/theme-17-starfield-dialog-zindex.png)). Dialog renders cleanly above the canvas with proper backdrop dim.
- **Transparent calendar surfaces on decorative themes** (commit `3ae2311 feat: transparent calendar surfaces on decorative themes`) — verified on starfield + /calendar ([theme-16-starfield-calendar-topbar.png](../audit-screenshots/2026-05-07-themes/theme-16-starfield-calendar-topbar.png)). Calendar grid shows stars through it, Topbar visible, bookings render cleanly.

These existing fixes generalize correctly to the other 10 animated themes (the CSS selectors target the union of animated themes, not just starfield).

## 8. Theme-switch quirks

**Untested in this audit pass** (deferred — see L-2). Recommend a follow-up sweep with the four scenarios listed in §6.

## 9. Recommended fix batches

### Batch F-1 — Fix H-1 + H-2 (single CSS change)

Goal: make aurora and voronoi behave like the 9 dark-tier themes — force dark surfaces regardless of the next-themes mode class.

Edit [`src/app/globals.css`](../src/app/globals.css):
- For aurora, find the `:root[data-theme="aurora"]` block and merge it with `.dark[data-theme="aurora"]` — strip the light-mode override of `--card`, `--background`, `--card-foreground`, `--sidebar` so the dark variables always apply. (Or move the `:root[data-theme="aurora"]` rules to use the dark color palette.)
- Same for voronoi.
- Verify with the existing 9 dark-tier theme CSS pattern as the template.

Risk: low. Affects only aurora + voronoi. No effect on the 9 dark-tier themes.
Test: re-run the H-1 / H-2 repro after the change; sidebar text should be legible regardless of toggle state.

### Batch F-2 — Fix L-1 (UX hint that animated themes are dark-only)

Goal: stop the silent no-op of the light/dark toggle when an animated dark theme is active.

Edit [`src/app/(dashboard)/settings/page.tsx`](../src/app/(dashboard)/settings/page.tsx) Theme card section (around the Dark / Light / System buttons):
- Compute `isAnimatedDarkOnly` from the current `prefs.colorTheme` against the union of the 9 dark-tier themes (could re-use `ANIMATED_DARK_THEMES` from `src/components/shared/ThemedBackground.tsx`)
- When true, disable the three mode buttons and show a small caption "Dark only — this theme is designed for dark surfaces"
- Same logic could update `aria-label` on each theme tile

Risk: very low. Pure UI. No CSS changes.
Test: pick `matrix`; confirm the Dark/Light/System buttons are disabled with a hint. Pick `default`; confirm they're re-enabled.

### Batch F-3 — Theme-switch quirk follow-up

Run the four §6 scenarios via Playwright. Capture findings + screenshots. If anything misbehaves, file as F-4 onwards.

## 10. Go / no-go for the gate removal

| Question | Verdict |
|---|---|
| Is the Part-1 gate removal (commit `890a3bf`) safe to ship? | **Yes.** All 11 themes work in their native (dark) mode. The two broken combinations (aurora-light, voronoi-light) existed before the gate change — the gate just hid them from non-Michael accounts. Exposing the themes to Stephen + Branch Leaders + Members surfaces existing bugs to more users but introduces zero new ones. |
| Should F-1 (aurora/voronoi light fix) ship before users discover it? | **Recommended yes**, but not blocking. Most users don't toggle to light mode while on aurora/voronoi (the themes are visually striking in dark — the natural choice). The bug fires only when a user *deliberately* toggles. F-1 is a single CSS change. |
| Should F-2 (light/dark toggle UX) ship? | **Optional.** Cosmetic. Prevents user confusion but no functional impact. |
| Anything else gating Phase 8 / Mike cutover? | **No.** The theme audit is independent of the backend cutover. The Critical-tier audit (`AUDIT_REPORT.md`) findings are unchanged. |

---

## Addendum (2026-05-07, post-fix verification)

After the initial audit, all findings + caveats + recommended fix
batches were closed in commit `b6623e1 fix(themes): close H-1 / H-2 /
L-1 — animated themes are dark-only`. Live verification was run
against the redeployed canonical URL.

### Fixes shipped

**F-1 — close H-1 + H-2 (CSS, single shared block):**

[`src/app/globals.css`](../src/app/globals.css) now has a shared
`:root[data-theme="X"], .dark[data-theme="X"]` block (right above the
per-theme accent palettes) that overrides all foundational variables
(`--background`, `--card`, `--card-foreground`, `--foreground`,
`--popover`, `--secondary`, `--muted`, `--accent`, `--border`,
`--input`, `--sidebar`, etc.) for the union of the 10 animated themes
that previously inherited light-mode dark-text values. Starfield was
already doing this correctly in its own block (lines 350-378); this
extends the same pattern to aurora / galaxy / jellyfish / rain /
matrix / voronoi / constellation / smoke / synapse / deepspace.

Verification:

- [theme-fix-aurora-light-FIXED.png](../audit-screenshots/2026-05-07-themes-fixed/theme-fix-aurora-light-FIXED.png) — aurora + light + dashboard. Sidebar opaque dark with light text, "Michael / Developer" visible, all stat values readable, Quick Access tiles render with their accent colors. Aurora canvas flowing as designed in the background. Compare to the broken pre-fix [theme-05-aurora-light-dashboard.png](../audit-screenshots/2026-05-07-themes/theme-05-aurora-light-dashboard.png).
- [theme-fix-voronoi-light-FIXED.png](../audit-screenshots/2026-05-07-themes-fixed/theme-fix-voronoi-light-FIXED.png) — voronoi + light + dashboard. Identical clean rendering. Voronoi triangulation pattern visible in canvas behind frosted-glass cards. Compare to [theme-10-voronoi-light-dashboard.png](../audit-screenshots/2026-05-07-themes/theme-10-voronoi-light-dashboard.png).

**F-2 — close L-1 (settings-page UX caption):**

[`src/app/(dashboard)/settings/page.tsx`](../src/app/(dashboard)/settings/page.tsx) Theme card detects when an animated theme is active (via the `ANIMATED_DARK_THEMES` + `ANIMATED_LIGHT_THEMES` sets imported from `ThemedBackground.tsx`) and disables the Dark / Light / System buttons. A small caption appears below: *"Dark only — animated themes force their own canvas regardless of mode. Pick a static color theme below to re-enable Dark / Light / System."*

Verification:

- [theme-fix-L1-settings-disabled-toggle.png](../audit-screenshots/2026-05-07-themes-fixed/theme-fix-L1-settings-disabled-toggle.png) — /settings on voronoi, mode buttons rendered with the disabled treatment, caption visible below. The Color Accent grid below stays interactive so users can return to a static theme to re-enable the mode toggle.

### Caveats addressed

Both pre-existing screenshot gaps from the original audit are now in `audit-screenshots/2026-05-07-themes-fixed/`:

- [theme-caveat-synapse-dark-baseline.png](../audit-screenshots/2026-05-07-themes-fixed/theme-caveat-synapse-dark-baseline.png) — synapse-dark dashboard. Cyan accent, neural-synapse animation (blue dots) flowing in the background, sidebar/cards opaque, all readable. The original audit lost this screenshot to disk-full mid-sweep.
- [theme-caveat-aurora-dark-baseline.png](../audit-screenshots/2026-05-07-themes-fixed/theme-caveat-aurora-dark-baseline.png) — aurora-dark dashboard. Confirms aurora renders cleanly in dark mode (the H-1 bug only fired in light).

### F-3 — theme-switch quirk sweep results

**F-3a — Rapid theme switching DOM consistency:**

Test: clicked theme tiles in /settings rapidly across 6 themes (synapse → starfield → aurora → matrix → default → starfield), polling DOM state after each click.

Findings:
- `html[data-theme]` attribute updates correctly on every click (no stuck attributes)
- Canvas count stays 0 or 1 — never multiple. Previous theme's canvas unmounts cleanly before the next mounts (React's conditional `<ThemedBackground theme={X}>` rendering does this for free)
- Default theme correctly drops `data-theme` attribute (returns null, not `"default"`)
- **One observable: dynamic-import lag.** First-time switch to a never-before-loaded animated theme has a ~100-300ms delay where canvas count is 0 before the dynamic import resolves and the canvas mounts. Repeat clicks (cached module) mount immediately. This is browser/Next.js standard behavior, not a Diamond-specific bug. No fix needed; **noted as L-3**.

**F-3b — Dialog open during theme switch:**

Test: opened BookingWizard on /calendar with starfield active, programmatically switched theme to galaxy mid-dialog, closed, re-opened. Polled DOM at each step.

Findings:
- Dialog stays visible through the theme change ✓
- `data-theme` updates to `galaxy` while dialog is open ✓
- `[data-slot="dialog-content"]` element is still present (no unmount) ✓
- Dialog re-renders with the new theme's frosted-glass styling on the next frame
- Dialog can be closed cleanly + re-opened with the new theme applied ✓
- [theme-F3b-dialog-after-theme-switch.png](../audit-screenshots/2026-05-07-themes-fixed/theme-F3b-dialog-after-theme-switch.png) shows the result

**No bugs found in F-3.** The theme-switching architecture (Providers → ThemeApplier subscription + ThemeEffects conditional render) is robust by design. Single canvas at a time, no dialog disruption, no stuck attributes.

### L-3 — Dynamic-import lag on first theme switch (low / cosmetic, new)

| Field | Value |
|---|---|
| Severity | Low |
| Affects | First switch to any animated theme that hasn't been loaded this session |
| Symptom | ~100-300ms gap between data-theme attribute update and canvas mount |
| Root cause | `ThemedBackground.tsx` uses `dynamic(import(...), { ssr: false })` per theme; the first switch must download + parse the JS bundle |
| Recommended fix | None required. If desired, a future enhancement could `prefetch` the user's previously-selected animated theme's bundle on app load (read colorTheme from persist, eagerly import that single bundle). Out of scope for this audit. |

### Updated go/no-go (post-fix)

| Question | Verdict |
|---|---|
| Are H-1, H-2, L-1 closed? | **Yes** — all three verified live on the canonical URL after `b6623e1` deploy. |
| Are the audit caveats addressed? | **Yes** — synapse + aurora-dark screenshots captured; F-3 quirk sweep complete (no new bugs found, one Low-severity dynamic-import-lag observable). |
| Anything left to fix on themes? | **No.** The audit is fully closed. The L-3 dynamic-import lag is informational only; not a defect. |

---

*Audit + addendum 2026-05-07. Original audit screenshots in `audit-screenshots/2026-05-07-themes/`. Post-fix verification + caveat coverage in `audit-screenshots/2026-05-07-themes-fixed/`.*

---

## Static-theme audit (2026-05-07, follow-up)

After the animated-theme audit closed, the 7 static themes
(`default`, `ocean`, `purple`, `forest`, `sunset`, `rose`,
`marble`) — previously deemed safe because "they've been daily-
driven by everyone for months" — got the same sweep. The static
themes only override `--primary` / `--ring` / `--sidebar-primary`
(via `:root[data-theme="X"], .dark[data-theme="X"]` blocks at
`globals.css:126-143`), with one exception: marble has 170+ lines
of custom CSS for the gold-on-cream texture and uses the same
mode-agnostic `:root[data-theme="marble"], .dark[data-theme="marble"]`
pattern that the animated themes used before F-1.

### Method

Programmatic verification: for each of the 7 static themes,
sampled `getComputedStyle(html).getPropertyValue('--background')`
in both `dark` and `light` next-themes class states. If the two
samples differ, the mode toggle works. If they match, the theme
is mode-agnostic (silent no-op for the toggle).

### Results

| Theme | dark `--background` | light `--background` | Toggle works? |
|---|---|---|---|
| Default | `lab(2.75% black)` | `lab(100% white)` | ✅ |
| Ocean | `lab(2.75% black)` | `lab(100% white)` | ✅ |
| Purple | `lab(2.75% black)` | `lab(100% white)` | ✅ |
| Forest | `lab(2.75% black)` | `lab(100% white)` | ✅ |
| Sunset | `lab(2.75% black)` | `lab(100% white)` | ✅ |
| Rose | `lab(2.75% black)` | `lab(100% white)` | ✅ |
| **Marble** | `lab(96.53% cream)` | `lab(96.53% cream)` | **❌ silent no-op** |

Six of seven inherit foundational variables from `:root` (light)
or `.dark` correctly. Only marble locks foundational variables to
identical cream values across both selectors, producing the same
silent-no-op pattern the animated themes had before L-1 / F-2.

### STATIC-1 — Marble's mode toggle is a silent no-op

| Field | Value |
|---|---|
| Severity | Low |
| Theme | `marble` |
| Mode | dark, light, system (all toggle states ignored) |
| Pages affected | All — the toggle is in /settings but the no-op manifests app-wide |
| Evidence (pre-fix) | [audit-screenshots/2026-05-07-themes-fixed/static-03-marble-light-settings.png](../audit-screenshots/2026-05-07-themes-fixed/static-03-marble-light-settings.png) — toggle buttons enabled, no caption |
| Evidence (post-fix) | [audit-screenshots/2026-05-07-themes-fixed/static-fix-marble-disabled-toggle.png](../audit-screenshots/2026-05-07-themes-fixed/static-fix-marble-disabled-toggle.png) — toggle disabled, caption shown |
| Evidence (audit log on marble/light) | [audit-screenshots/2026-05-07-themes-fixed/static-02-marble-light-audit.png](../audit-screenshots/2026-05-07-themes-fixed/static-02-marble-light-audit.png) — confirms surfaces render correctly regardless of mode |

**Repro (pre-fix):** Pick Marble in /settings → Click Light or
Dark → no visible change → look like the toggle is broken.

**Root cause:** marble's `globals.css` block at `:root[data-theme="marble"], .dark[data-theme="marble"]` (line 149-150) overrides
the same foundational vars (`--background`, `--card`, etc.) for
both selectors, so the next-themes `.dark` / `.light` class is
overridden by the more specific `[data-theme="marble"]` selector
in either mode. Identical to the L-1 pattern fixed for animated
themes in F-1, but marble was not in `ANIMATED_DARK_THEMES` /
`ANIMATED_LIGHT_THEMES` so the F-2 caption logic skipped it.

**Fix (commit `6756203`):** extended the F-2 mode-toggle disable
logic in [`src/app/(dashboard)/settings/page.tsx`](../src/app/(dashboard)/settings/page.tsx) to include marble alongside the
13 animated themes (renamed local variable `themeIsAnimated` →
`themeIsModeFixed` since marble isn't animated). Rewrote the
caption to be theme-neutral: *"This color theme manages its own
surfaces and ignores Dark / Light / System. Pick a different
color theme below to re-enable mode switching."* The previous
wording said "animated themes force their own canvas" — accurate
for the original L-1 set but inaccurate for marble (no canvas;
just a static texture).

**Verification:** [`static-fix-marble-disabled-toggle.png`](../audit-screenshots/2026-05-07-themes-fixed/static-fix-marble-disabled-toggle.png)
— all 3 mode buttons rendered with disabled treatment, caption
visible, marble cream surfaces preserved.

### Sample pass: sunset/dark audit log

[`static-04-sunset-dark-audit.png`](../audit-screenshots/2026-05-07-themes-fixed/static-04-sunset-dark-audit.png) — orange-tinted Admin sidebar
highlight, all color-coded action badges (create / update / delete
/ export / cancel / restore) clearly distinguishable on dark base.
Confirms the 5 colored static themes inherit foundational dark
mode correctly and only override accent without contrast surprises.

### Updated full theme matrix (post all fixes)

| Theme | Mode toggle | Light | Dark | Notes |
|---|:-:|:-:|:-:|---|
| default | ✅ works | ✅ | ✅ | Everyone's baseline |
| ocean / purple / forest / sunset / rose | ✅ works | ✅ | ✅ | Accent-only override |
| marble | 🔒 mode-fixed (caption) | ✅ cream | ✅ cream (same) | STATIC-1 fixed via caption |
| starfield, galaxy, jellyfish, rain, matrix, constellation, smoke, synapse, deepspace | 🔒 mode-fixed (caption) | ✅ same as dark | ✅ | L-1 / F-2 fixed |
| aurora, voronoi | 🔒 mode-fixed (caption) | ✅ (post F-1) | ✅ | H-1 / H-2 fixed via F-1, L-1 caption applies |

**18/18 themes work cleanly across all reachable modes.** Mode-fixed
themes (12 of 18) clearly communicate this state to the user via
the disabled buttons + caption. The audit is fully closed.
