#!/usr/bin/env node
// Converts the cached Pantheon OpenAPI 3.0 (v1) spec into structured markdown docs under docs/
// Run via: node scripts/generate.js  or  npm run generate
// Requires: node scripts/fetch-spec.js to have run first (or .cache/openapi.json to exist)

'use strict';

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', '.cache', 'openapi.json');
const DOCS_DIR = path.join(__dirname, '..', 'docs');
const REF_PREFIX = '#/components/schemas/';

// Sites sub-group routing: match on path segment keywords. Order matters — first match wins.
const SITES_GROUPS = [
  { name: 'builds',         file: 'builds.md',         match: /\/builds/ },
  { name: 'multidevs',      file: 'multidevs.md',      match: /\/multidevs?(-names)?/ },
  { name: 'code',           file: 'code.md',            match: /\/(git-branches|commits|code\/sync|code-cache|upstream-updates)/ },
  { name: 'backups',        file: 'backups.md',        match: /\/backup/ },
  { name: 'exports',        file: 'exports.md',        match: /\/export/ },
  { name: 'imports',        file: 'imports.md',        match: /\/import/ },
  { name: 'database-files', file: 'database-files.md', match: /\/(database|files)\/clone/ },
  { name: 'runtime-logs',   file: 'runtime-logs.md',   match: /runtime-log/ },
  { name: 'domains',        file: 'domains.md',        match: /domain/ },
  { name: 'cache',          file: 'cache.md',           match: /\/cache\/clear/ },
  { name: 'memberships',    file: 'memberships.md',    match: /\/(users|membership|promote-to-owner|leave)/ },
  { name: 'workflows',      file: 'workflows.md',       match: /\/workflows/ },
  { name: 'addons',         file: 'addons.md',          match: /\/addons/ },
  { name: 'migration',      file: 'migration.md',       match: /\/migration/ },
  { name: 'environments',   file: 'environments.md',    match: /\/environments\/[^/]+\/(lock|status-checks|rollback|wipe|deployments|development-mode|merges)/ },
];

function slugify(tag) {
  return tag.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function httpMethod(method) {
  return method.toUpperCase().padEnd(6);
}

function schemaRef(ref) {
  if (!ref) return '';
  return ref.replace(REF_PREFIX, '');
}

function resolveSchema(schema) {
  if (!schema) return 'N/A';
  if (schema.$ref) return schemaRef(schema.$ref);
  if (schema.type === 'array' && schema.items) {
    if (schema.items.$ref) return `${schemaRef(schema.items.$ref)}[]`;
    return `${schema.items.type || 'any'}[]`;
  }
  return schema.type || 'object';
}

function renderParams(params = []) {
  const pathParams = params.filter(p => p.in === 'path');
  const queryParams = params.filter(p => p.in === 'query');

  const lines = [];

  if (pathParams.length) {
    lines.push('**Path params:** ' + pathParams.map(p =>
      `\`${p.name}\`${p.required ? '' : '?'} (${resolveSchema(p.schema)})`
    ).join(', '));
  }

  if (queryParams.length) {
    lines.push('**Query params:** ' + queryParams.map(p =>
      `\`${p.name}\`${p.required ? '' : '?'} (${resolveSchema(p.schema)})`
    ).join(', '));
  }

  return lines;
}

function renderRequestBody(requestBody) {
  const mediaType = ((requestBody || {}).content || {})['application/json'];
  const schema = mediaType && mediaType.schema;
  if (!schema) return null;
  return `**Body:** \`${resolveSchema(schema)}\``;
}

function renderResponse(responses = {}) {
  const success = responses['200'] || responses['201'] || responses['202'];
  if (!success) return 'N/A';

  const schema = ((success.content || {})['application/json'] || {}).schema;
  if (!schema) return success.description || 'N/A';
  return resolveSchema(schema);
}

function renderEndpoint(method, pathStr, op) {
  const lines = [];
  lines.push(`### \`${httpMethod(method).trim()} ${pathStr}\``);
  if (op.summary) lines.push(`**${op.summary}**`);
  if (op.description && op.description !== op.summary) lines.push(`\n${op.description}`);
  lines.push('');

  const paramLines = renderParams(op.parameters);
  const bodyLine = renderRequestBody(op.requestBody);
  if (bodyLine) paramLines.push(bodyLine);
  lines.push(paramLines.join('  \n') || 'None');

  lines.push('');
  lines.push(`**Returns:** ${renderResponse(op.responses)}`);
  lines.push('');
  return lines.join('\n');
}

function renderDefinition(name, def) {
  const lines = [];
  lines.push(`### ${name}`);
  if (def.description) lines.push(`_${def.description}_\n`);

  const props = def.properties || {};
  const required = new Set(def.required || []);

  if (Object.keys(props).length === 0) {
    if (def.type) lines.push(`Type: \`${def.type}\``);
    lines.push('');
    return lines.join('\n');
  }

  lines.push('| Field | Type | Required | Description |');
  lines.push('|-------|------|----------|-------------|');

  for (const [field, schema] of Object.entries(props)) {
    const type = schema.$ref ? schemaRef(schema.$ref) :
                 (schema.type === 'array' && schema.items)
                   ? `${schema.items.$ref ? schemaRef(schema.items.$ref) : schema.items.type}[]`
                   : (schema.type || 'object');
    const req = required.has(field) ? 'Yes' : 'No';
    const desc = (schema.description || schema.enum ? `${schema.description || ''} ${schema.enum ? `Enum: ${schema.enum.join(', ')}` : ''}`.trim() : '').replace(/\|/g, '\\|');
    lines.push(`| \`${field}\` | \`${type}\` | ${req} | ${desc} |`);
  }

  lines.push('');
  return lines.join('\n');
}

function groupSitesPaths(sitePaths) {
  const groups = SITES_GROUPS.map(g => ({ ...g, endpoints: [] }));
  const base = { name: 'sites-base', file: 'sites-base.md', endpoints: [] };

  for (const [p, methods] of Object.entries(sitePaths)) {
    const matched = groups.find(g => g.match.test(p));
    if (matched) {
      matched.endpoints.push([p, methods]);
    } else {
      base.endpoints.push([p, methods]);
    }
  }

  return [base, ...groups.filter(g => g.endpoints.length > 0)];
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function generateTimestamp() {
  return new Date().toISOString();
}

function main() {
  if (!fs.existsSync(CACHE_FILE)) {
    console.error(`Spec not found at .cache/openapi.json. Run: node scripts/fetch-spec.js`);
    process.exit(1);
  }

  const spec = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  const { paths = {}, components = {}, info = {} } = spec;
  const definitions = components.schemas || {};
  const generated = generateTimestamp();

  // Clean docs dir
  if (fs.existsSync(DOCS_DIR)) {
    fs.rmSync(DOCS_DIR, { recursive: true });
  }
  fs.mkdirSync(DOCS_DIR, { recursive: true });

  // Group paths by tag
  const byTag = {};
  for (const [pathStr, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods)) {
      const tags = op.tags || ['untagged'];
      for (const tag of tags) {
        if (!byTag[tag]) byTag[tag] = {};
        if (!byTag[tag][pathStr]) byTag[tag][pathStr] = {};
        byTag[tag][pathStr][method] = op;
      }
    }
  }

  const tagSummaries = [];

  // Generate each tag section
  for (const [tag, tagPaths] of Object.entries(byTag)) {
    const slug = slugify(tag);
    const tagDir = path.join(DOCS_DIR, slug);
    fs.mkdirSync(tagDir, { recursive: true });

    if (slug === 'sites') {
      // Split sites into sub-groups
      const subGroups = groupSitesPaths(tagPaths);
      const totalCount = Object.values(tagPaths).reduce((n, m) => n + Object.keys(m).length, 0);
      const subDigestLines = [
        `# Sites API — Sub-Index`,
        `_Generated: ${generated} from Pantheon API v1 (spec ${info.version})_`,
        '',
        `The Sites tag contains ${totalCount} endpoints, organized below by domain:`,
        '',
        '| Section | File | Description |',
        '|---------|------|-------------|',
      ];

      for (const group of subGroups) {
        if (group.endpoints.length === 0) continue;
        const groupFile = path.join(tagDir, group.file);
        const lines = [
          `# Sites — ${group.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
          `_Generated: ${generated} from Pantheon API v1 (spec ${info.version})_`,
          '',
        ];

        for (const [p, methods] of group.endpoints) {
          for (const [method, op] of Object.entries(methods)) {
            lines.push(renderEndpoint(method, p, op));
            lines.push('---');
          }
        }

        writeFile(groupFile, lines.join('\n'));
        subDigestLines.push(`| ${group.name} | \`.pantheonapi-docs/sites/${group.file}\` | ${group.endpoints.length} endpoint(s) |`);
      }

      subDigestLines.push('');
      subDigestLines.push(`**Navigation:** Load a sub-section file to see full endpoint details.`);
      writeFile(path.join(tagDir, 'digest.md'), subDigestLines.join('\n'));

      tagSummaries.push({
        tag,
        slug,
        count: totalCount,
        digest: `.pantheonapi-docs/sites/digest.md`,
        note: 'Split into sub-sections — see sites/digest.md',
      });

    } else {
      // Single file for small tags
      const lines = [
        `# ${tag} API`,
        `_Generated: ${generated} from Pantheon API v1 (spec ${info.version})_`,
        '',
      ];

      for (const [p, methods] of Object.entries(tagPaths)) {
        for (const [method, op] of Object.entries(methods)) {
          lines.push(renderEndpoint(method, p, op));
          lines.push('---');
        }
      }

      const outFile = path.join(tagDir, 'endpoints.md');
      writeFile(outFile, lines.join('\n'));

      const count = Object.values(tagPaths).reduce((n, m) => n + Object.keys(m).length, 0);
      tagSummaries.push({ tag, slug, count, digest: `.pantheonapi-docs/${slug}/endpoints.md` });
    }
  }

  // Generate schemas index
  const schemasDir = path.join(DOCS_DIR, 'schemas');
  fs.mkdirSync(schemasDir, { recursive: true });

  const schemaLines = [
    `# Pantheon API — Schema Definitions`,
    `_Generated: ${generated} from Pantheon API v1 (spec ${info.version})_`,
    '',
    `${Object.keys(definitions).length} schemas`,
    '',
  ];

  for (const [name, def] of Object.entries(definitions)) {
    schemaLines.push(renderDefinition(name, def));
    schemaLines.push('---');
  }

  writeFile(path.join(schemasDir, 'index.md'), schemaLines.join('\n'));

  // Generate root digest
  const digestLines = [
    `# Pantheon API — Root Digest`,
    `_Generated: ${generated} from Pantheon API v1 (spec ${info.version})_`,
    `_Base URL: https://api.pantheon.io/v1 | Auth: \`Authorization: Bearer <personal-access-token>\`_`,
    '',
    '## Navigation',
    '',
    'Docs are installed to `.pantheonapi-docs/` in your project root.',
    'Start here, then load the relevant section.',
    '',
    '## Sections',
    '',
    '| Tag | Endpoints | Path |',
    '|-----|-----------|------|',
  ];

  for (const s of tagSummaries) {
    digestLines.push(`| ${s.tag} | ${s.count} | \`${s.digest}\` |`);
  }

  digestLines.push('');
  digestLines.push(`## Schemas`);
  digestLines.push('');
  digestLines.push(`All ${Object.keys(definitions).length} request/response schemas: \`.pantheonapi-docs/schemas/index.md\``);
  digestLines.push('');
  digestLines.push('## Key Patterns');
  digestLines.push('');
  digestLines.push('- **Auth:** Send `Authorization: Bearer <token>` (a Pantheon personal access token or access token) on every request — there is no token-exchange step.');
  digestLines.push('- **Async ops:** Most write operations return a workflow ID. Poll `GET /sites/{site_id}/workflows/{workflow_id}` (also available scoped to `/users/{user_id}/workflows/{workflow_id}` and `/workspaces/{workspace_id}/workflows/{workflow_id}`) for status.');
  digestLines.push('- **Workflow result:** `{ result: "succeeded"|"failed"|"running", step, active_description }`');
  digestLines.push('');

  writeFile(path.join(DOCS_DIR, 'digest.md'), digestLines.join('\n'));

  // Summary
  console.log(`Generated docs → ${DOCS_DIR}`);
  console.log(`  Sections: ${tagSummaries.map(s => `${s.tag} (${s.count})`).join(', ')}`);
  console.log(`  Schemas: ${Object.keys(definitions).length}`);
  console.log(`  Root digest: docs/digest.md`);
}

main();
