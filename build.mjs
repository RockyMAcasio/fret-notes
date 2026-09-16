import { stripTypeScriptTypes } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
writeFileSync(new URL('./app.js', import.meta.url), stripTypeScriptTypes(readFileSync(new URL('./src/app.ts', import.meta.url), 'utf8')));
console.log('Built app.js');
