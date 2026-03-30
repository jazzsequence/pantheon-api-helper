# pantheon-api-helper

Installs pre-generated [Pantheon Public API](https://api.pantheon.io/docs) documentation into any Node.js project so Claude (and other AI coding agents) have full API context at the start of every session.

Inspired by the [Next.js bundled docs pattern](https://nextjs.org/blog/next-16-2-ai): on install, docs are fetched from the live Pantheon Swagger spec, converted to structured markdown, and placed in `.pantheonapi-docs/` at your project root. Your `AGENTS.md` is patched automatically to tell Claude where to look.

## What it does

1. **Fetches** the Pantheon Swagger 2.0 spec from `https://api.pantheon.io/docs/swagger.json`
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
npm install github:jazzsequence/pantheon-api-helper#v1.0.0
npm install github:jazzsequence/pantheon-api-helper#<commit-sha>
```

Or add it to `package.json` manually:
```json
{
  "dependencies": {
    "pantheon-api-helper": "github:jazzsequence/pantheon-api-helper"
  }
}
```

That's it. After install you'll have:

```
your-project/
├── .pantheonapi-docs/
│   ├── digest.md                  ← start here
│   ├── auth/
│   │   └── endpoints.md
│   ├── organizations/
│   │   └── endpoints.md
│   ├── sites/
│   │   ├── digest.md              ← sites sub-index
│   │   ├── sites-base.md
│   │   ├── environments.md
│   │   ├── backups.md
│   │   ├── domains.md
│   │   ├── code.md
│   │   ├── cache.md
│   │   ├── database-files.md
│   │   ├── addons.md
│   │   ├── workflows.md
│   │   ├── memberships.md
│   │   ├── env-variables.md
│   │   └── metrics.md
│   ├── users/
│   │   └── endpoints.md
│   └── schemas/
│       └── index.md               ← all 119 schemas
└── AGENTS.md                      ← patched with navigation block
```

## Keeping docs current

Re-fetch the latest spec and regenerate:

```bash
npx pantheon-api-helper update
```

Or use the npm script if you have it wired up:

```bash
npm run pantheon-api-helper:update
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

The sites section (66 endpoints) is split into sub-sections to keep context loads small — Claude reads the sites digest first, then loads only the sub-section it needs.

## Doc structure

### Root digest — `.pantheonapi-docs/digest.md`

Overview of all sections, endpoint counts, key auth and async patterns. Always start here.

### Sections

| Section | Endpoints | Notes |
|---------|-----------|-------|
| `auth/endpoints.md` | 1 | Machine token exchange |
| `organizations/endpoints.md` | 12 | Org memberships, sites, users, upstreams |
| `sites/digest.md` | 66 | Sub-indexed — see below |
| `users/endpoints.md` | 10 | SSH keys, machine tokens, memberships |

### Sites sub-sections

| File | Endpoints |
|------|-----------|
| `sites/sites-base.md` | Site CRUD, plan, owner, upstream, payment method |
| `sites/environments.md` | Deploy, wipe, connection mode, lock, PHP version |
| `sites/backups.md` | Create, catalog, schedule, restore, download URL |
| `sites/domains.md` | Add, remove, primary, DNS recommendations |
| `sites/code.md` | Commits, diffstat, rebuild, upstream updates |
| `sites/cache.md` | Clear environment and upstream cache |
| `sites/database-files.md` | Clone, import database and files |
| `sites/addons.md` | Redis and Solr enable/disable |
| `sites/workflows.md` | Workflow status, logs |
| `sites/memberships.md` | Team and org membership management |
| `sites/env-variables.md` | Environment variables |
| `sites/metrics.md` | Site metrics and timeseries |

### Schemas — `.pantheonapi-docs/schemas/index.md`

All 119 request/response type definitions from the spec.

## Key API patterns

**Authentication**

```
POST /v0/authorize/machine-token
Body: { machine_token, client }
→ Returns: session token (use as Bearer token)
```

**Authorization header**

```
Authorization: Bearer <session-token>
```

**Async operations**

Most write operations (deploy, backup, clone, etc.) return a workflow ID immediately. Poll for completion:

```
GET /v0/sites/{site_id}/workflows/{workflow_id}
→ { result: "succeeded" | "failed" | "running", step, active_description }
```

## Scripts in this package

| Script | What it does |
|--------|-------------|
| `scripts/fetch-spec.js` | Downloads `swagger.json` → `.cache/swagger.json` |
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
console.log(section('auth/endpoints'));
console.log(section('schemas/index'));
```

## Requirements

- Node.js 18+
- Network access at install time (fetches from `api.pantheon.io`)
