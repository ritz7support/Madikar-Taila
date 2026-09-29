import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname,'..');
const template = fs.readFileSync(path.join(root,'server','worker-template.js'),'utf8');
fs.mkdirSync(path.join(root,'dist','server'),{recursive:true});
fs.writeFileSync(path.join(root,'dist','server','index.js'),template);
fs.mkdirSync(path.join(root,'dist','.openai'),{recursive:true});
fs.copyFileSync(path.join(root,'.openai','hosting.json'),path.join(root,'dist','.openai','hosting.json'));
console.log('Built Supabase-backed store worker.');
