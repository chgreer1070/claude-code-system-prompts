import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const SYSTEM_PROMPTS_DIR = join(ROOT_DIR, 'system-prompts');
const README_PATH = join(ROOT_DIR, 'README.md');

const errors = [];

const readme = readFileSync(README_PATH, 'utf-8');

// Collect prompt links referenced in the README, e.g. (./system-prompts/foo.md)
const linkRegex = /\.\/system-prompts\/([a-zA-Z0-9._-]+\.md)/g;
const linkedFiles = [];
let m;
while ((m = linkRegex.exec(readme)) !== null) {
  linkedFiles.push(m[1]);
}

// Files actually present on disk
const diskFiles = readdirSync(SYSTEM_PROMPTS_DIR).filter((f) => f.endsWith('.md'));
const diskSet = new Set(diskFiles);

// 1. Broken links: README references a file that does not exist
const linkedSet = new Set(linkedFiles);
for (const f of linkedSet) {
  if (!diskSet.has(f)) {
    errors.push(`Broken link: README references ./system-prompts/${f} but the file does not exist.`);
  }
}

// 2. Orphans: file on disk not referenced anywhere in the README
for (const f of diskFiles) {
  if (!linkedSet.has(f)) {
    errors.push(`Orphan file: system-prompts/${f} exists but is not linked from README.md.`);
  }
}

// 3. Duplicate links: the same file linked more than once
const counts = new Map();
for (const f of linkedFiles) {
  counts.set(f, (counts.get(f) || 0) + 1);
}
for (const [f, n] of counts) {
  if (n > 1) {
    errors.push(`Duplicate link: ./system-prompts/${f} is linked ${n} times in README.md.`);
  }
}

// 4. Internal anchor links resolve to a heading
const slugify = (text) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // drop punctuation (keep word chars, whitespace, hyphen)
    .replace(/\s+/g, '-');

const headingSlugs = new Set();
for (const line of readme.split('\n')) {
  const h = line.match(/^#{1,6}\s+(.*)$/);
  if (h) headingSlugs.add(slugify(h[1]));
}

const anchorRegex = /\]\(#([a-z0-9-]+)\)/g;
let a;
while ((a = anchorRegex.exec(readme)) !== null) {
  if (!headingSlugs.has(a[1])) {
    errors.push(`Broken anchor: README links to #${a[1]} but no matching heading exists.`);
  }
}

// 5. Each prompt file has a well-formed metadata comment with a ccVersion
for (const f of diskFiles) {
  const content = readFileSync(join(SYSTEM_PROMPTS_DIR, f), 'utf-8');
  const comment = content.match(/^<!--\n([\s\S]*?)\n-->/);
  if (!comment) {
    errors.push(`Metadata: system-prompts/${f} is missing a leading <!-- ... --> metadata block.`);
    continue;
  }
  if (!/^ccVersion:\s*\S+/m.test(comment[1])) {
    errors.push(`Metadata: system-prompts/${f} metadata block is missing a ccVersion field.`);
  }
}

if (errors.length > 0) {
  console.error(`\u2717 Validation failed with ${errors.length} issue(s):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `\u2713 Validation passed: ${linkedSet.size} linked prompt file(s), ${diskFiles.length} file(s) on disk, no broken/duplicate links, anchors and metadata OK.`
);
