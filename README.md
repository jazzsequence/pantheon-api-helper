# pantheon-api-helper

Installs pre-generated [Pantheon Public API](https://api.pantheon.io/v1/docs) documentation into any Node.js project so Claude (and other AI coding agents) have full API context at the start of every session.

Inspired by the [Next.js bundled docs pattern](https://nextjs.org/blog/next-16-2-ai): on install, docs are fetched from the live Pantheon OpenAPI spec, converted to structured markdown, and placed in `.pantheonapi-docs/` at your project root. Your `AGENTS.md` is patched automatically to tell Claude where to look.

> **Targeting the legacy v0 (Swagger 2.0) API?** Install from the `v0` branch instead — see [Installation](#installation). `main` tracks the current v1 (OpenAPI 3.0) API.

## What it does

1. **Fetches** the Pantheon OpenAPI 3.0 spec from `https://api.pantheon.io/v1/openapi.json`
2. **Generates** structured markdown docs organized into a digest hierarchy
3. **Installs** them to `.pantheonapi-docs/` in your project root
4. **Patches** your `AGENTS.md` with a navigation block (creating it if it doesn't exist)
5. **Patches** your `.gitignore` to exclude `.pantheonapi-docs/`

Nothing is committed to this repo — everything is fetched and generated fresh on install.

## Installation

This package is not published to npm — install directly from GitHub:

**npm**
```bash
npm install github:jazzsequence/pantheon-api-helper
```

**yarn**
```bash
yarn add github:jazzsequence/pantheon-api-helper
```

**pnpm**
```bash
pnpm add github:jazzsequence/pantheon-api-helper
```

**Pin to a specific tag or commit** (recommended for reproducibility):
```bash
npm install github:jazzsequence/pantheon-api-helper#v2.0.0
npm install github:jazzsequence/pantheon-api-helper#<commit-sha>
```

**Legacy v0 (Swagger 2.0) API** — install from the `v0` branch:
```bash
npm install github:jazzsequence/pantheon-api-helper#v0
```

Or add it to `package.json` manually:
```json
{
  "dependencies": {
    "pantheon-api-helper": "github:jazzsequence/pantheon-api-helper"
  }
}
```

That's it. If the postinstall didn't run (some environments suppress lifecycle scripts, or the network was unavailable at install time), run:

```bash
npx pantheon-api-helper update
```

After install you'll have:

```
your-project/
├── .pantheonapi-docs/
│   ├── digest.md                  ← start here
│   ├── sites/
│   │   ├── digest.md              ← sites sub-index
│   │   ├── sites-base.md
│   │   ├── environments.md
│   │   ├── builds.md
│   │   ├── multidevs.md
│   │   ├── code.md
│   │   ├── backups.md
│   │   ├── exports.md
│   │   ├── imports.md
│   │   ├── database-files.md
│   │   ├── runtime-logs.md
│   │   ├── domains.md
│   │   ├── cache.md
│   │   ├── memberships.md
│   │   ├── workflows.md
│   │   ├── addons.md
│   │   └── migration.md
│   ├── workspaces/
│   │   └── endpoints.md
│   ├── secrets/
│   │   └── endpoints.md
│   ├── users/
│   │   └── endpoints.md
│   └── schemas/
│       └── index.md               ← all 244 schemas
└── AGENTS.md                      ← patched with navigation block
```

## Keeping docs current

Re-fetch the latest spec and regenerate:

```bash
npx pantheon-api-helper update
```

## How Claude uses the docs

After install, your `AGENTS.md` will contain a block like this:

```markdown
<!-- BEGIN:pantheon-api-helper -->
## Pantheon API

Pre-generated Pantheon API docs are installed in `.pantheonapi-docs/`.

**Start here:** `.pantheonapi-docs/digest.md` — overview, key patterns, section index.
...
<!-- END:pantheon-api-helper -->
```

Claude reads `AGENTS.md` at the start of every session. When you ask it to do anything with the Pantheon API, it navigates to the relevant section file rather than guessing from training data.

The sites section (65 endpoints) is split into sub-sections to keep context loads small — Claude reads the sites digest first, then loads only the sub-section it needs.

## Doc structure

### Root digest — `.pantheonapi-docs/digest.md`

Overview of all sections, endpoint counts, key auth and async patterns. Always start here.

### Sections

| Section | Endpoints | Notes |
|---------|-----------|-------|
| `sites/digest.md` | 65 | Sub-indexed — see below |
| `workspaces/endpoints.md` | 15 | Workspace CRUD, memberships, upstreams, logo — replaces v0's `organizations` |
| `secrets/endpoints.md` | 8 | Customer secrets, per-environment overrides |
| `users/endpoints.md` | 5 | Current user, SSH keys, upstreams, workflows |

### Sites sub-sections

| File | Endpoints |
|------|-----------|
| `sites/sites-base.md` | Site CRUD, environment list/create, deploy, unfreeze |
| `sites/environments.md` | Lock, status checks, rollback, wipe, deployments, dev-mode, merges |
| `sites/builds.md` | Build status and logs |
| `sites/multidevs.md` | Multidev create/delete/validate |
| `sites/code.md` | Commits, code sync, upstream updates, git branches, code cache |
| `sites/backups.md` | Create, catalog, schedule, restore, download URL |
| `sites/exports.md` | Environment exports and download URLs |
| `sites/imports.md` | Database/file imports by file or URL |
| `sites/database-files.md` | Clone database and files between environments |
| `sites/runtime-logs.md` | Environment and tenant runtime logs |
| `sites/domains.md` | Add, remove, primary domain, ownership verification |
| `sites/cache.md` | Clear environment cache |
| `sites/memberships.md` | Site team membership, promote to owner, leave |
| `sites/workflows.md` | Workflow status, site-status |
| `sites/addons.md` | Addon enable/disable |
| `sites/migration.md` | Migration completion |

### Schemas — `.pantheonapi-docs/schemas/index.md`

All 244 request/response type definitions from the spec.

## Key API patterns

**Authorization header** — no token exchange step; send your personal access token (or access token) directly:

```
Authorization: Bearer <token>
```

**Async operations**

Most write operations (deploy, backup, clone, etc.) return a workflow ID immediately. Poll for completion:

```
GET /sites/{site_id}/workflows/{workflow_id}
GET /users/{user_id}/workflows/{workflow_id}
GET /workspaces/{workspace_id}/workflows/{workflow_id}
→ { result: "succeeded" | "failed" | "running", step, active_description }
```

## Scripts in this package

| Script | What it does |
|--------|-------------|
| `scripts/fetch-spec.js` | Downloads `openapi.json` → `.cache/openapi.json` |
| `scripts/generate.js` | Converts cached spec → `docs/` markdown |
| `scripts/postinstall.js` | Fetch + generate + copy to `.pantheonapi-docs/` + patch AGENTS.md + .gitignore |
| `scripts/cli.js` | `npx pantheon-api-helper <update\|generate\|fetch>` |

## Programmatic usage

```js
const { docsDir, rootDigest, section } = require('pantheon-api-helper');

// Absolute path to docs inside node_modules
console.log(docsDir());

// Root digest as a string
console.log(rootDigest());

// A specific section
console.log(section('sites/backups'));
console.log(section('workspaces/endpoints'));
console.log(section('schemas/index'));
```

## Requirements

- Node.js 18+
- Network access at install time (fetches from `api.pantheon.io`)
