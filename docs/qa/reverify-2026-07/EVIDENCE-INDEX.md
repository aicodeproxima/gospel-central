# Evidence index — 2026-07 cutover re-verify

The re-verify evidence PNGs are **not** committed (multi-MB screenshots, regenerable). They live in the
untracked working copy `Case Study/audit/remediation-verify/`. This manifest pins each one's `sha256`
(tamper-evident) and the claim it proves, so the tracked audit trail references them with integrity even
though the binaries stay out of git history.

| File | sha256 | Proves | Surface |
|---|---|---|---|
| `evidence-188-unassigned-card.png` | `64c11a98fb39289ed8db28ff3b4617e0504e04471c34a7fe4c54c53c6b92209b` | Finding 188 — a teacherless ContactCard's Teacher quick-field reads **"Unassigned"**, never the church/`groupName` | local dev mock |
| `evidence-236-vb-no-availability.png` | `1ce34d3750c2430079cc302b6f0ef2ee21f4657757e8fa3b1ff49a4c2e050aa6` | Finding 236 — booking wizard Room step shows the Virginia Beach rooms disabled with **"No availability this day"** on the VB-closed next-Wednesday | local dev mock (mock-only seed row) |
| `evidence-78-151-admin-dimmed-inactive.png` | `825fb4d2a7b650ebb4e97bba7c050f943f47b17fe0dcc1ae020a72da998e37b3` | Finding 78/151 — Admin ▸ Contacts renders a bulk-deleted contact **dimmed + Inactive badge + working Restore** | real-backend preview |
| `evidence-seededge-converted-badge.png` | `6bdddab1e83b2b0cf48be574441862d1e4d4db62abefb7854fa6aaae1dba89a8` | Seed-edge finding 62 — Admin ▸ Contacts shows the **Converted** badge on Apollos (c-70) & Crispus (c-71), and Inactive+Restore on Demas (c-68) | local dev mock (mock-only seed rows) |
| `evidence-seededge-retention-badge.png` | `dcbbb725b987f61c1da839cfd2141f0b666ec0b897e77f55fc09cc2bf1463086` | Seed-edge finding 61 — the red **"Retention expired"** badge renders in ContactsTable | real-backend preview (synthesized `retainUntil`) |
| `evidence-188-live-unassigned-card-035e3a2.png` | `45c084cedd3b29b46c6f024bc429d3ee724f226ccd46f362706e44b3d67754f2` | Finding 188 **re-proven on the current build** — teacherless Grid card reads `TEACHER Unassigned` with no church name; sidebar fingerprint `v1.0.0 · 035e3a2` visible in-frame | real-backend preview @`035e3a2` |
| `evidence-219-live-subject-title-035e3a2.png` | `00160df2cdf7d66ae8b3c74d2bb7ffbd618b97173dc9223ecb475160bd68f8a1` | Finding 219 **re-proven on the current build** — the wizard-created study booking on the Wed Jul 15 calendar (title suffix asserted via REST; card shows contact/teacher/time); fingerprint `035e3a2` visible in-frame | real-backend preview @`035e3a2` |

## What IS tracked here (the durable text trail)
- `REVERIFY-ROUTINE.md` — the re-verify routine (contract + checklist).
- `reverify-2026-07-13.jsonl` — the 2026-07-13 run (19/21 Fixed-verified, closed).
- `reverify-2026-07-14.jsonl` — the 2026-07-14 closure run (Phases A–G exec log; render source for the summary).
- `SUMMARY-2026-07-13.md` / `SUMMARY-2026-07-14.md` — the rendered summaries.
- `PLAN-not-observable-2026-07-14.md` — the executed closure plan.

These are point-in-time snapshots (backup); the live working copies remain in the untracked
`Case Study/` tree by project convention.
