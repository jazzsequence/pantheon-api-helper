#!/usr/bin/env node
// pantheon-api-helper CLI
// Usage:
//   npx pantheon-api-helper update   — re-fetch spec + regenerate docs + re-copy
//   npx pantheon-api-helper generate — regenerate from cached spec
//   npx pantheon-api-helper fetch    — fetch spec only

'use strict';

const { execSync } = require('child_process');
const path = require('path');

const SCRIPTS = path.join(__dirname);
const cmd = process.argv[2];

function run(script) {
  execSync(`node ${path.join(SCRIPTS, script)}`, { stdio: 'inherit' });
}

switch (cmd) {
  case 'update':
    run('fetch-spec.js');
    run('generate.js');
    run('postinstall.js');
    break;
  case 'generate':
    run('generate.js');
    run('postinstall.js');
    break;
  case 'fetch':
    run('fetch-spec.js');
    break;
  default:
    console.log(`
pantheon-api-helper — Pantheon API context for Claude agents

Commands:
  update      Re-fetch Pantheon spec, regenerate docs, re-install to .pantheonapi-docs/
  generate    Regenerate docs from cached spec, re-install to .pantheonapi-docs/
  fetch       Fetch latest Pantheon API spec only

Usage:
  npx pantheon-api-helper <command>
`);
    process.exit(cmd ? 1 : 0);
}
