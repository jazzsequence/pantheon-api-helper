#!/usr/bin/env node
// Runs after `npm install`.
// 1. Generates docs/ inside the package (from spec/swagger.json)
// 2. Copies docs/ into <project-root>/.pantheonapi-docs/
// 3. Patches <project-root>/AGENTS.md with a BEGIN/END marker block
// 4. Patches <project-root>/.gitignore to ignore .pantheonapi-docs/

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// npm sets INIT_CWD to the directory where `npm install` was invoked (the consuming
// project root). process.cwd() inside a postinstall is the package dir in node_modules,
// so we can't use it to find the project root.
const PACKAGE_ROOT = path.join(__dirname, '..');
const PROJECT_ROOT = process.env.INIT_CWD || process.cwd();

// Safety: don't run if we're installing the package itself
const isPackageItself = PROJECT_ROOT === PACKAGE_ROOT ||
  !fs.existsSync(path.join(PROJECT_ROOT, 'package.json')) ||
  JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')).name === 'pantheon-api-helper';

if (isPackageItself) {
  process.exit(0);
}

const DOCS_SRC = path.join(PACKAGE_ROOT, 'docs');
const DOCS_DEST = path.join(PROJECT_ROOT, '.pantheonapi-docs');
const AGENTS_MD = path.join(PROJECT_ROOT, 'AGENTS.md');
const GITIGNORE = path.join(PROJECT_ROOT, '.gitignore');

// --------------------------------------------------------------------------
// 0. Fetch spec then generate docs
// --------------------------------------------------------------------------

try {
  execSync(`node ${path.join(PACKAGE_ROOT, 'scripts', 'fetch-spec.js')}`, { stdio: 'inherit' });
} catch (err) {
  console.error('[pantheon-api-helper] Spec fetch failed:', err.message);
  process.exit(1);
}

try {
  execSync(`node ${path.join(PACKAGE_ROOT, 'scripts', 'generate.js')}`, { stdio: 'inherit' });
} catch (err) {
  console.error('[pantheon-api-helper] Doc generation failed:', err.message);
  process.exit(1);
}

const MARKER_START = '<!-- BEGIN:pantheon-api-helper -->';
const MARKER_END = '<!-- END:pantheon-api-helper -->';

// --------------------------------------------------------------------------
// 1. Copy docs
// --------------------------------------------------------------------------

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (!fs.existsSync(DOCS_SRC)) {
  console.error('[pantheon-api-helper] docs/ not found in package — skipping copy.');
} else {
  copyDir(DOCS_SRC, DOCS_DEST);
  console.log('[pantheon-api-helper] Docs installed to .pantheonapi-docs/');
}

// --------------------------------------------------------------------------
// 2. Patch AGENTS.md
// --------------------------------------------------------------------------

const AGENTS_BLOCK = `${MARKER_START}
## Pantheon API

Pre-generated Pantheon API docs are installed in \`.pantheonapi-docs/\`.

**Start here:** \`.pantheonapi-docs/digest.md\` — overview, key patterns, section index.

| Section | File |
|---------|------|
| Auth (1 endpoint) | \`.pantheonapi-docs/auth/endpoints.md\` |
| Organizations (12 endpoints) | \`.pantheonapi-docs/organizations/endpoints.md\` |
| Sites (66 endpoints, sub-indexed) | \`.pantheonapi-docs/sites/digest.md\` |
| Users (10 endpoints) | \`.pantheonapi-docs/users/endpoints.md\` |
| All schemas (119 definitions) | \`.pantheonapi-docs/schemas/index.md\` |

Before writing any code that calls the Pantheon API, read the relevant section file.
The sites section is large — always read \`.pantheonapi-docs/sites/digest.md\` first to
navigate to the correct sub-section (environments, backups, domains, code, etc.).

**API base:** \`https://api.pantheon.io\`
**Auth:** \`Authorization: Bearer <machine-token>\`
**Async pattern:** Write ops return a workflow ID — poll \`GET /v0/sites/{id}/workflows/{workflow_id}\` for status.
${MARKER_END}`;

let agentsContent = '';
if (fs.existsSync(AGENTS_MD)) {
  agentsContent = fs.readFileSync(AGENTS_MD, 'utf8');
}

const hasBlock = agentsContent.includes(MARKER_START);

if (hasBlock) {
  // Replace existing block
  const startIdx = agentsContent.indexOf(MARKER_START);
  const endIdx = agentsContent.indexOf(MARKER_END) + MARKER_END.length;
  agentsContent = agentsContent.slice(0, startIdx) + AGENTS_BLOCK + agentsContent.slice(endIdx);
} else {
  // Append block
  agentsContent = agentsContent ? agentsContent.trimEnd() + '\n\n' + AGENTS_BLOCK + '\n' : AGENTS_BLOCK + '\n';
}

fs.writeFileSync(AGENTS_MD, agentsContent);
console.log(`[pantheon-api-helper] ${hasBlock ? 'Updated' : 'Created'} AGENTS.md block`);

// --------------------------------------------------------------------------
// 3. Patch .gitignore
// --------------------------------------------------------------------------

const GITIGNORE_ENTRY = '.pantheonapi-docs/';

let gitignoreContent = '';
if (fs.existsSync(GITIGNORE)) {
  gitignoreContent = fs.readFileSync(GITIGNORE, 'utf8');
}

if (!gitignoreContent.includes(GITIGNORE_ENTRY)) {
  const section = '\n# Pantheon API helper — generated docs\n.pantheonapi-docs/\n';
  fs.writeFileSync(GITIGNORE, gitignoreContent.trimEnd() + section);
  console.log('[pantheon-api-helper] Added .pantheonapi-docs/ to .gitignore');
} else {
  console.log('[pantheon-api-helper] .gitignore already includes .pantheonapi-docs/');
}
