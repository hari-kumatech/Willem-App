#!/usr/bin/env node
// Installs a new or updated HTML app (for example a new dashboard.html exported from claude.ai) into the
// Sales Hub at app/public/mek-movers/, with the changes every such file needs there:
//
//   1. <script src="js/claude-local.js"> in <head>: gives the page window.claude.use('db' | 'downloads'),
//      backed by the Sales Hub database (table mm_documents; the 'leads' collection is the Sales Hub leads).
//   2. The dashboard's "MEK Movers Sales" hub link opens the Sales Hub (/overzicht) instead of claude.ai.
//
// Then it checks the file and reports what still needs a code change (new menu sections, unsupported
// claude.use features). See docs/ADDING-FEATURES.md.
//
//   node tools/install-html.mjs features/<folder>/dashboard.html             replace / add with the same name
//   node tools/install-html.mjs features/<folder>/nieuw.html planning.html   install under another name
//   node tools/install-html.mjs <file> --check                               only report, change nothing
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_DIR = join(ROOT, 'app', 'public', 'mek-movers');
const SECTIONS = join(ROOT, 'app', 'src', 'modules', 'movers', 'sections.ts');
const SHIM_TAG = '<script src="js/claude-local.js"></script>';
const HUB = '/overzicht';
const SUPPORTED_USE = ['db', 'downloads'];

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const [source, targetName] = args.filter((a) => !a.startsWith('--'));
if (!source || !existsSync(source)) {
  console.error('Usage: node tools/install-html.mjs <file.html> [name-in-app.html] [--check]');
  process.exit(1);
}

const name = targetName ?? basename(source);
const target = join(TARGET_DIR, name);
const rel = (p) => relative(ROOT, p).split('\\').join('/');
const notes = [];
let html = readFileSync(source, 'utf8');

// 1. claude.ai runtime → Sales Hub database
if (!html.includes('js/claude-local.js')) {
  if (!/<head[^>]*>/i.test(html)) throw new Error('No <head> tag found: is this a complete HTML page?');
  html = html.replace(/<head[^>]*>/i, (tag) => `${tag}\n${SHIM_TAG}`);
  notes.push('added the claude-local.js script (database and downloads through the Sales Hub)');
}

// 2. Hub link → Sales Hub, in the same window (the dashboard runs inside a frame)
html = html.replace(/const HUB_URL = 'https:\/\/claude\.ai\/artifact\/[^']*';/, () => {
  notes.push(`hub link now opens the Sales Hub (${HUB})`);
  return `const HUB_URL = '${HUB}'; // Sales Hub (was the claude.ai hub artifact)`;
});
html = html.replace(/href: HUB_URL, target: '_blank', rel: 'noopener'/, "href: HUB_URL, target: '_top'");

// Checks
const warnings = [];
const used = [...new Set([...html.matchAll(/claude\.use\(\s*['"]([\w-]+)['"]/g)].map((m) => m[1]))];
const unsupported = used.filter((u) => !SUPPORTED_USE.includes(u));
if (unsupported.length) {
  warnings.push(`uses claude.use(${unsupported.map((u) => `'${u}'`).join(', ')}), which the Sales Hub does not provide yet (only ${SUPPORTED_USE.join(', ')}): extend app/public/mek-movers/js/claude-local.js`);
}
const otherArtifacts = html.match(/https:\/\/claude\.ai\/artifact\/[\w-]+/g);
if (otherArtifacts) warnings.push(`still links to claude.ai artifacts: ${[...new Set(otherArtifacts)].join(', ')}`);

const sectionsText = readFileSync(SECTIONS, 'utf8');
const registered = sectionsText.includes(`'/mek-movers/${name}'`);
if (!registered) {
  warnings.push(`${name} is a new app, not in the menu yet: add it to FRAME_SRC and MOVERS_SECTIONS in ${rel(SECTIONS)}, a label in app/src/i18n/messages/common.ts (nl + en) and a menu item in app/src/components/layout/SideNav.tsx`);
}

// Dashboard: every section in its own NAV list needs a main-menu item (sections.ts, innerLabel)
const navBlock = html.match(/const NAV = \[([\s\S]*?)\n\s*\];/);
if (navBlock && name === 'dashboard.html') {
  const unescape = (s) => s.replace(/\\'/g, "'");
  const navLabels = [...navBlock[1].matchAll(/\[\s*'[^']+',\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => unescape(m[1]));
  const menuLabels = [...sectionsText.matchAll(/innerLabel:\s*(?:'((?:[^'\\]|\\.)*)'|"([^"]*)")/g)].map((m) => unescape(m[1] ?? m[2]));
  const leadsLabel = sectionsText.match(/INNER_LEADS_LABEL = '([^']+)'/)?.[1];
  const newSections = navLabels.filter((l) => !menuLabels.includes(l) && l !== leadsLabel);
  const goneSections = menuLabels.filter((l) => !navLabels.includes(l));
  if (newSections.length) warnings.push(`new dashboard sections not in the main menu yet: ${newSections.join(', ')} (add them to MOVERS_SECTIONS in ${rel(SECTIONS)})`);
  if (goneSections.length) warnings.push(`main-menu items whose dashboard section no longer exists: ${goneSections.join(', ')} (remove them from ${rel(SECTIONS)})`);
}

const existed = existsSync(target);
if (!checkOnly) writeFileSync(target, html);

console.log(`${checkOnly ? 'Checked (nothing written)' : existed ? 'Replaced' : 'Added'} ${rel(target)} from ${source}`);
for (const n of notes) console.log(`  ${checkOnly ? 'would change' : 'changed'}: ${n}`);
for (const w of warnings) console.log(`  TO DO: ${w}`);
if (!warnings.length && !checkOnly) {
  console.log('  Ready: close the app window, then start it again (Start MEK Sales Hub.cmd rebuilds automatically).');
}
process.exit(warnings.length ? 2 : 0);
