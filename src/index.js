'use strict';

const path = require('path');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');

/**
 * Returns the absolute path to the pre-generated docs directory (inside node_modules).
 * The installed copy lives at .pantheonapi-docs/ in your project root.
 */
function docsDir() {
  return DOCS_DIR;
}

/**
 * Returns the root digest markdown as a string.
 */
function rootDigest() {
  return fs.readFileSync(path.join(DOCS_DIR, 'digest.md'), 'utf8');
}

/**
 * Returns a specific section file as a string.
 * @param {string} section — e.g. 'auth/endpoints', 'sites/digest', 'schemas/index'
 */
function section(name) {
  const file = name.endsWith('.md') ? name : `${name}.md`;
  return fs.readFileSync(path.join(DOCS_DIR, file), 'utf8');
}

module.exports = { docsDir, rootDigest, section };
