// Canonical contract lives with the CA API. No registry or runtime dependency.
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const source = process.argv[2]
if (!source)
  throw new Error(
    "Usage: node scripts/sync-companion-contract.mjs /path/to/CA/src/lib/companion/contract.ts [--check]"
  )
const content = await readFile(resolve(source), "utf8")
const hash = createHash("sha256").update(content).digest("hex")
const output = `// GENERATED from CA src/lib/companion/contract.ts. SHA256: ${hash}\n${content}`
const destination = new URL("../companion/archive-contract.ts", import.meta.url)
if (process.argv.includes("--check")) {
  if ((await readFile(destination, "utf8")) !== output)
    throw new Error("Companion contract is out of sync")
} else await writeFile(destination, output)
console.log(
  `Companion contract ${process.argv.includes("--check") ? "verified" : "synced"} (${hash.slice(0, 12)})`
)
