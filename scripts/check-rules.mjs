// Firestore kuralları: firebase/firestore-sailing.rules ile gorev-data.js'teki gösterilen kopya aynı mı
import { readFileSync } from 'node:fs';
const file = readFileSync(new URL('../firebase/firestore-sailing.rules', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/js/gorev-data.js', import.meta.url), 'utf8');
const m = /const RULES = `([\s\S]*?)`;\n/.exec(js);
const copy = m && m[1].replace(/\\\$\{/g, '${').replace(/\\`/g, '`').replace(/\\\\/g, '\\');
if (copy !== file) { console.error('✗ gorev-data.js RULES, firebase/firestore-sailing.rules ile aynı değil'); process.exit(1); }
console.log('✓ Firestore kural kopyası güncel');
