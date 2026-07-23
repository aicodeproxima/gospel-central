# Operations — Gospel Central Knowledge Base

This folder is the **operations knowledge base**: one article per app operation (account creation,
booking, contact conversion, permissions, reporting, etc.), written in plain English and anchored to
the code that actually implements it. Each article is a stylized Word document; this file is the
registry + the naming rules every article follows.

---

## Naming convention (use for ALL future articles)

```
GC-KB-<NNNN>-<category>-<kebab-title>-v<MAJOR.MINOR>.<ext>
```

| Token | Meaning | Rules |
|---|---|---|
| `GC` | Product code — **G**ospel **C**entral | Fixed. |
| `KB` | Artifact type — **K**nowledge **B**ase article | Fixed for KB articles. Reserve sibling codes for other types later: `SOP` (standard operating procedure), `ADR` (architecture decision), `RB` (runbook). |
| `NNNN` | Global sequence number, zero-padded to 4 digits | Monotonic across the WHOLE KB (not per-category). Never reused, even if an article is retired. Next number is tracked in the registry below. |
| `category` | Lowercase domain token for search/filter | One of: `accounts`, `contacts`, `bookings`, `calendar`, `groups`, `permissions`, `reports`, `admin`, `themes`, `settings`, `platform`. Add new tokens here when a genuinely new domain appears. |
| `kebab-title` | Human-readable slug | Lowercase, hyphen-separated, no spaces/underscores. Keep it short and specific. |
| `vMAJOR.MINOR` | Version | Bump **MINOR** for edits/clarifications; bump **MAJOR** when the underlying process changes (a new step, a removed field, a behavior flip). Only the latest version file is kept in-folder; superseded versions move to `Operations/_archive/`. |
| `.ext` | File type | `.docx` for the canonical stylized article. |

**Example:** `GC-KB-0001-accounts-account-creation-v1.0.docx`

### Why this shape
- **Searchable:** every article starts `GC-KB-`; filter by domain with the `category` token; find a topic by the slug.
- **Trackable:** the zero-padded global sequence gives a stable, orderable ID that never collides; the version tag makes staleness obvious at a glance.
- **Sortable:** filenames sort in creation order by default.

### In-document metadata (every article carries a header table)
`Article ID` · `Title` · `Category` · `Version` · `Status` (Draft / Approved / Superseded) · `Owner` ·
`Created` · `Last updated` · `Applies-to build` (git short-commit the article was verified against) ·
`Source-of-truth files` (the code paths the article is anchored to).

---

## Article registry

| ID | Title | Category | Version | Status | File |
|---|---|---|---|---|---|
| GC-KB-0001 | Account Creation | accounts | v1.0 | Draft | `GC-KB-0001-accounts-account-creation-v1.0.docx` |

**Next sequence number:** `0002`
