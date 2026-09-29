import {createHash} from 'node:crypto';
import {copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync} from 'node:fs';
import path from 'node:path';

const projectId = 'appgprj_6ab742ddf3e48191911b4bb531bb0ca8';
const source = realpathSync(path.resolve(import.meta.dirname, '..'));
const targetArgument = process.argv[2];

if (!targetArgument || !path.isAbsolute(targetArgument)) {
  throw new Error('Pass the absolute path of the opened Sites checkout.');
}
const target = realpathSync(targetArgument);
if (target === source || target.startsWith(source + path.sep)) {
  throw new Error('The Sites checkout must be separate from website/.');
}
if (!statSync(path.join(target, '.git'), {throwIfNoEntry: false})?.isDirectory()) {
  throw new Error('The destination is not an opened Sites Git checkout.');
}
for (const root of [source, target]) {
  const manifest = JSON.parse(readFileSync(path.join(root, '.openai', 'hosting.json'), 'utf8'));
  if (manifest.project_id !== projectId) throw new Error(`Site ID mismatch in ${root}`);
}

const ignored = new Set(['.git', '.sites-runtime', '.sites-checkout', 'node_modules']);
function files(root, directory = root) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    if (ignored.has(entry.name)) return [];
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink requires manual review: ${absolute}`);
    if (entry.isDirectory()) return files(root, absolute);
    if (!entry.isFile()) throw new Error(`Unsupported entry: ${absolute}`);
    return [path.relative(root, absolute)];
  });
}
const sourceFiles = files(source);
const sourceSet = new Set(sourceFiles);
const stale = files(target).filter(file => !sourceSet.has(file));
if (stale.length) {
  throw new Error(`Review and remove stale files in the Sites checkout before syncing:\n${stale.join('\n')}`);
}
for (const relative of sourceFiles) {
  const from = path.join(source, relative);
  const to = path.join(target, relative);
  mkdirSync(path.dirname(to), {recursive: true});
  copyFileSync(from, to);
  const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
  if (digest(from) !== digest(to)) throw new Error(`Copy verification failed: ${relative}`);
}
console.log(`Synchronized and verified ${sourceFiles.length} files for ${projectId}.`);
