import { cp, lstat, mkdir, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bundledStarter = fileURLToPath(new URL('../assets/starter/', import.meta.url));
const forbidden = new Set(['.git', 'node_modules', 'dist', '.local']);

async function inspectSource(root) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error(`Starter must not contain symbolic links: ${entry.name}`);
    if (forbidden.has(entry.name)) throw new Error(`Starter contains a generated or private directory: ${entry.name}`);
    if (entry.isDirectory()) await inspectSource(path.join(root, entry.name));
    else if (!entry.isFile()) throw new Error(`Unsupported starter entry: ${entry.name}`);
  }
}

export async function initializeH5(output, { starterDir = bundledStarter } = {}) {
  if (!output || typeof output !== 'string') throw new Error('--output is required');
  const source = await realpath(starterDir);
  if (!(await lstat(source)).isDirectory()) throw new Error('Starter asset directory is missing');
  await inspectSource(source);
  const target = path.resolve(output);
  const parent = await realpath(path.dirname(target));
  const canonicalTarget = path.join(parent, path.basename(target));
  const relative = path.relative(source, canonicalTarget);
  if (!relative || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
    throw new Error('Output must be outside the bundled starter directory');
  }
  // Exclusive directory creation preserves existing customer files, including an empty directory.
  await mkdir(canonicalTarget);
  for (const name of await readdir(source)) {
    await cp(path.join(source, name), path.join(canonicalTarget, name), {
      recursive: true, force: false, errorOnExist: true, dereference: false,
    });
  }
  return canonicalTarget;
}

async function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node init-h5.mjs --output <new-customer-repository/h5-app>');
    return;
  }
  if (args.length !== 2 || args[0] !== '--output') throw new Error('Use --output <new-directory>');
  const output = await initializeH5(args[1]);
  console.log(JSON.stringify({ output, next: ['Read README.md and AGENTS.md', 'npm ci', 'npm run typecheck', 'npm run build', 'npm run dev'] }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
