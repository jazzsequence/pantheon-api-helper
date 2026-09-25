#!/usr/bin/env node
// Fetches the Pantheon OpenAPI 3.0 (v1) spec and saves it to .cache/openapi.json
// Run via: node scripts/fetch-spec.js  or  npm run fetch

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const SPEC_URL = 'https://api.pantheon.io/v1/openapi.json';
const CACHE_DIR = path.join(__dirname, '..', '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'openapi.json');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return resolve(fetch(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  console.log(`Fetching Pantheon API spec from ${SPEC_URL}...`);
  const raw = await fetch(SPEC_URL);
  const spec = JSON.parse(raw);

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(spec, null, 2));

  const pathCount = Object.keys(spec.paths || {}).length;
  const schemaCount = Object.keys((spec.components || {}).schemas || {}).length;
  console.log(`Saved OpenAPI ${spec.openapi} spec (Pantheon API v1) — ${pathCount} paths, ${schemaCount} schemas → ${CACHE_FILE}`);
}

main().catch((err) => {
  console.error('fetch-spec failed:', err.message);
  process.exit(1);
});
