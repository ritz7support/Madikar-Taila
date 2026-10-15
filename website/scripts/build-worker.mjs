import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root = path.resolve(import.meta.dirname,'..');
const files=fs.readdirSync(path.join(root,'dist','client'),{recursive:true,withFileTypes:true}).filter(entry=>entry.isFile())
  .map(entry=>path.join(entry.parentPath,entry.name)).sort();
const hash=createHash('sha256');
for(const file of files){hash.update(path.relative(path.join(root,'dist','client'),file).replaceAll('\\','/'));hash.update(fs.readFileSync(file));}
const template = fs.readFileSync(path.join(root,'server','worker-template.js'),'utf8').replace('__STATIC_VERSION__',hash.digest('hex').slice(0,20));
fs.mkdirSync(path.join(root,'dist','server'),{recursive:true});
fs.writeFileSync(path.join(root,'dist','server','index.js'),template);
fs.mkdirSync(path.join(root,'dist','.openai'),{recursive:true});
fs.copyFileSync(path.join(root,'.openai','hosting.json'),path.join(root,'dist','.openai','hosting.json'));
console.log('Built Supabase-backed store worker.');
