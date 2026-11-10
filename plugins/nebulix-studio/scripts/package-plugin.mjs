import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = key => args[args.indexOf(key) + 1];
if (!args.includes('--service-url') || !args.includes('--output')) throw new Error('--service-url and --output are required');
const url = new URL(option('--service-url'));
if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('HTTPS required');
if (url.username || url.password || url.search || url.hash) throw new Error('Invalid service URL');
const source = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = path.resolve(option('--output'));
if (output === source || output.startsWith(source + path.sep)) throw new Error('Output must be outside the plugin source directory');
try { await readFile(path.join(output, '.codex-plugin/plugin.json')); throw new Error('Output already contains a plugin; use a new directory'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(output, { recursive: true });
for (const name of await readdir(source)) {
  if (name === '.mcp.json') continue;
  await cp(path.join(source, name), path.join(output, name), { recursive: true, errorOnExist: true, force: false });
}
await writeFile(path.join(output, '.mcp.json'), JSON.stringify({ mcpServers: { 'nebulix-studio': { type: 'http', url: `${url.href.replace(/\/$/, '')}/mcp/studio` } } }, null, 2) + '\n', { flag: 'wx' });
console.log(output);
