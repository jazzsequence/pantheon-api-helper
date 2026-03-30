#!/usr/bin/env node
// Converts the cached Pantheon Swagger spec into structured markdown docs under docs/
// Run via: node scripts/generate.js  or  npm run generate
// Requires: node scripts/fetch-spec.js to have run first (or .cache/swagger.json to exist)

'use strict';

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', '.cache', 'swagger.json');
const DOCS_DIR = path.join(__dirname, '..', 'docs');

// Sites sub-group routing: match on path segment keywords
const SITES_GROUPS = [
  { name: 'environments',    file: 'environments.md',    match: /\/environments\/[^/]+\/(deploy|wipe|connection-mode|lock|settings|phpversion)/ },
  { name: 'backups',         file: 'backups.md',          match: /\/backups/ },
  { name: 'domains',         file: 'domains.md',          match: /\/domains/ },
  { name: 'code',            file: 'code.md',             match: /\/(commits|diffstat|rebuild|upstream-updates|code)/ },
  { name: 'cache',           file: 'cache.md',            match: /\/clear-cache|\/cache/ },
  { name: 'database-files',  file: 'database-files.md',  match: /\/(database|files|clone-files|clone-database|import)/ },
  { name: 'addons',          file: 'addons.md',           match: /\/(redis|solr|addons)/ },
  { name: 'workflows',       file: 'workflows.md',        match: /\/workflows/ },
  { name: 'memberships',     file: 'memberships.md',      match: /\/(memberships|user-memberships|org-memberships)/ },
  { name: 'env-variables',   file: 'env-variables.md',   match: /\/(variables|envvars|environment-variables)/ },
  { name: 'metrics',         file: 'metrics.md',          match: /\/metrics/ },
];

function slugify(tag) {
  return tag.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function httpMethod(method) {
  return method.toUpperCase().padEnd(6);
}

function schemaRef(ref) {
  if (!ref) return '';
  return ref.replace('#/definitions/', '');
}

function resolveSchema(schema, definitions) {
  if (!schema) return 'N/A';
  if (schema.$ref) return schemaRef(schema.$ref);
  if (schema.type === 'array' && schema.items) {
    if (schema.items.$ref) return `${schemaRef(schema.items.$ref)}[]`;
    return `${schema.items.type || 'any'}[]`;
  }
  return schema.type || 'object';
}

function renderParams(params = [], definitions) {
  const pathParams = params.filter(p => p.in === 'path');
  const queryParams = params.filter(p => p.in === 'query');
  const bodyParams = params.filter(p => p.in === 'body');

  const lines = [];

  if (pathParams.length) {
    lines.push('**Path params:** ' + pathParams.map(p =>
      `\`${p.name}\`${p.required ? '' : '?'} (${p.type || 'string'})`
    ).join(', '));
  }

  if (queryParams.length) {
    lines.push('**Query params:** ' + queryParams.map(p =>
      `\`${p.name}\`${p.required ? '' : '?'} (${p.type || 'string'})`
    ).join(', '));
  }

  if (bodyParams.length) {
    const body = bodyParams[0];
    const schemaName = body.schema ? resolveSchema(body.schema, definitions) : 'N/A';
    lines.push(`**Body:** \`${schemaName}\``);
  }

  return lines.join('  \n') || 'None';
}

function renderResponse(responses = {}, definitions, specResponses = {}) {
  let success = responses['200'] || responses['201'] || responses['202'];
  if (!success) return 'N/A';

  // Dereference top-level $ref (e.g. { "$ref": "#/responses/SessionResponse" })
  if (success.$ref) {
    const refName = success.$ref.replace('#/responses/', '');
    success = specResponses[refName] || success;
  }

  if (!success.schema) return success.description || 'N/A';
  return resolveSchema(success.schema, definitions);
}

function renderEndpoint(method, pathStr, op, definitions, specResponses) {
  const lines = [];
  lines.push(`### \`${httpMethod(method).trim()} ${pathStr}\``);
  if (op.summary) lines.push(`**${op.summary}**`);
  if (op.description && op.description !== op.summary) lines.push(`\n${op.description}`);
  lines.push('');
  lines.push(renderParams(op.parameters, definitions));
  lines.push('');
  lines.push(`**Returns:** ${renderResponse(op.responses, definitions, specResponses)}`);
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
    console.error(`Spec not found at spec/swagger.json or .cache/swagger.json. Run: node scripts/fetch-spec.js`);
    process.exit(1);
  }

  const spec = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  const { paths = {}, definitions = {}, responses: specResponses = {}, info = {} } = spec;
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

    if (tag === 'sites') {
      // Split sites into sub-groups
      const subGroups = groupSitesPaths(tagPaths);
      const subDigestLines = [
        `# Sites API — Sub-Index`,
        `_Generated: ${generated} from Pantheon API v${info.version}_`,
        '',
        'The Sites tag contains 66 endpoints, organized below by domain:',
        '',
        '| Section | File | Description |',
        '|---------|------|-------------|',
      ];

      for (const group of subGroups) {
        if (group.endpoints.length === 0) continue;
        const groupFile = path.join(tagDir, group.file);
        const lines = [
          `# Sites — ${group.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
          `_Generated: ${generated} from Pantheon API v${info.version}_`,
          '',
        ];

        for (const [p, methods] of group.endpoints) {
          for (const [method, op] of Object.entries(methods)) {
            lines.push(renderEndpoint(method, p, op, definitions, specResponses));
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
        count: Object.values(tagPaths).reduce((n, m) => n + Object.keys(m).length, 0),
        digest: `.pantheonapi-docs/sites/digest.md`,
        note: 'Split into sub-sections — see sites/digest.md',
      });

    } else {
      // Single file for small tags
      const lines = [
        `# ${tag.charAt(0).toUpperCase() + tag.slice(1)} API`,
        `_Generated: ${generated} from Pantheon API v${info.version}_`,
        '',
      ];

      for (const [p, methods] of Object.entries(tagPaths)) {
        for (const [method, op] of Object.entries(methods)) {
          lines.push(renderEndpoint(method, p, op, definitions, specResponses));
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
    `_Generated: ${generated} from Pantheon API v${info.version}_`,
    '',
    `${Object.keys(definitions).length} definitions`,
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
    `_Generated: ${generated} from Pantheon API v${info.version}_`,
    `_Spec: ${spec.host} | Auth: \`Authorization: Bearer <machine-token>\`_`,
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
  digestLines.push('- **Auth:** `POST /v0/authorize/machine-token` → returns session token');
  digestLines.push('- **Async ops:** Most write operations return a workflow ID. Poll `GET /v0/sites/{site_id}/workflows/{workflow_id}` for status.');
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
