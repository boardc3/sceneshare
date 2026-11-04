// Syntax-check every API module (they are not bundled by Vite).
import { readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const files = [...readdirSync('api').filter((f) => f.endsWith('.js')).map((f) => `api/${f}`), ...readdirSync('api/_lib').map((f) => `api/_lib/${f}`)]
for (const f of files) execFileSync(process.execPath, ['--check', f], { stdio: 'inherit' })
console.log(`ok: ${files.length} api modules`)
