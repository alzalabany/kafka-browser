import { cp, mkdir, rm, writeFile, readFile, readdir, chmod } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const destination = path.join(root, '.desktop');
await rm(destination, { recursive:true, force:true });
await mkdir(path.join(destination, 'runtime'), { recursive:true });
await cp(path.join(root, '.next', 'standalone'), path.join(destination, 'server'), { recursive:true, dereference:true });
await cp(path.join(root, '.next', 'static'), path.join(destination, 'server', '.next', 'static'), { recursive:true });
await cp(path.join(root, 'public'), path.join(destination, 'server', 'public'), { recursive:true });
// Bundle the exact Node runtime used to build SQLite. Electron's Node ABI is different.
const runtime = path.join(destination, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node');
await cp(process.execPath, runtime);
await chmod(runtime, 0o755);
const license = await fetch(`https://nodejs.org/dist/${process.version}/LICENSE`);
if (!license.ok) throw new Error(`Could not retrieve bundled Node license (${license.status})`);
await writeFile(path.join(destination, 'runtime', 'LICENSE'), await license.text());
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
await mkdir(path.join(destination, 'app'));
await cp('desktop/main.cjs', path.join(destination, 'app', 'main.cjs'));
await writeFile(path.join(destination, 'app', 'package.json'), JSON.stringify({
  name:'kafka-browser-desktop', productName:'Kafka Browser', version:pkg.version,
  description:'A local Kafka developer tool', author:'Momen Zalabany', main:'main.cjs',
}, null, 2));
// Refuse to ship accidentally traced local credentials or databases.
async function audit(directory) {
  for (const entry of await readdir(directory, { withFileTypes:true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { if (['data','.git','artifacts'].includes(entry.name)) throw new Error(`Unexpected directory: ${file}`); await audit(file); }
    else if (/\.(sqlite(?:-wal|-shm)?|key|p12|pfx|jks)$/.test(entry.name) || /^\.env(?:\.|$)/.test(entry.name)) throw new Error(`Unexpected private file: ${file}`);
  }
}
await audit(destination);
console.log(`Desktop prepared for ${process.platform}/${process.arch} with Node ${process.version}`);
