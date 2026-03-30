# Pantheon API Helper — Agent Instructions

This package provides pre-generated documentation for the Pantheon Public API
(https://api.pantheon.io), structured for lazy-loading by AI agents.

## When installed in a project

Docs are installed to `.pantheonapi-docs/` at the consuming project root.
The project's `AGENTS.md` is patched automatically with a navigation block on install.

## When working in THIS package

Docs live in `docs/` (committed, pre-generated from the Swagger spec).

| File | Purpose |
|------|---------|
| `docs/digest.md` | Root index — start here |
| `docs/auth/endpoints.md` | Auth endpoints (1) |
| `docs/organizations/endpoints.md` | Organization endpoints (12) |
| `docs/sites/digest.md` | Sites sub-index — 66 endpoints split by domain |
| `docs/users/endpoints.md` | User endpoints (10) |
| `docs/schemas/index.md` | All 119 request/response schemas |

## Development workflow

```bash
# Re-fetch spec + regenerate all docs
npm run update

# Regenerate from cached spec (no network)
npm run generate

# Fetch spec only
node scripts/fetch-spec.js
```

## Package structure

```
docs/           Pre-generated markdown docs (committed)
scripts/
  fetch-spec.js   Downloads swagger.json → .cache/swagger.json
  generate.js     Converts spec → docs/
  postinstall.js  Copies docs → .pantheonapi-docs/, patches AGENTS.md + .gitignore
  cli.js          npx pantheon-api-helper <command>
src/index.js    Programmatic API (docsDir, rootDigest, section)
.cache/         Cached swagger.json (gitignored)
```

## Spec details

- Source: `https://api.pantheon.io/docs/swagger.json` (Swagger 2.0)
- Auth: `Authorization: Bearer <machine-token>` (obtain via `POST /v0/authorize/machine-token`)
- Async pattern: write ops return a workflow ID; poll `GET /v0/sites/{id}/workflows/{id}`
