// Pins the mock seed clock for the integration project. MUST be the FIRST entry
// in that project's `setupFiles` so this runs before any test imports the seed
// (ESM hoists imports, so the pin can't live in the same module as the server
// setup — it has to be its own file that runs first). 2026-06-22 is a Monday,
// which is what the seed's weekStart() resolves to.
(globalThis as { __MOCK_DATE__?: string }).__MOCK_DATE__ = '2026-06-22T12:00:00';
