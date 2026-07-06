// Run SQL against the Gospel Central Supabase project via the Management API.
// DDL (migrations) needs a personal access token (sbp_...), NOT the anon /
// service keys — pass it via the SB_PAT env var; never hardcode it here.
//
// usage: SB_PAT=sbp_... node scripts/sbq.mjs --file supabase/migrations/0008_auth_observability.sql --tx
//        SB_PAT=sbp_... node scripts/sbq.mjs --sql "select count(*) from public.users"
const REF = 'imjsdsepmhgazracegog';
const PAT = process.env.SB_PAT;
if (!PAT) {
  console.error('SB_PAT env var is required (Supabase personal access token, sbp_...)');
  process.exit(2);
}
import fs from 'node:fs';
const a = process.argv.slice(2);
const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
let sql = get('--sql');
if (get('--file')) sql = fs.readFileSync(get('--file'), 'utf8');
if (a.includes('--tx')) sql = 'begin;\n' + sql + '\ncommit;';
const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const text = await r.text();
console.log(`HTTP ${r.status}`);
console.log(text.slice(0, 2000));
process.exit(r.ok ? 0 : 1);
