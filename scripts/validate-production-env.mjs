import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const REQUIRED_VARIABLES = [
  "PLASMO_PUBLIC_FIREHOSE_API_ENDPOINT_URL",
  "PLASMO_PUBLIC_API_AUTH_TOKEN"
]

export function parseEnvironmentFile(contents) {
  const parsed = {}
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const normalized = line.startsWith("export ") ? line.slice(7) : line
    const separator = normalized.indexOf("=")
    if (separator === -1) continue

    const key = normalized.slice(0, separator).trim()
    let value = normalized.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) parsed[key] = value
  }
  return parsed
}

export function validateProductionEnvironment(environment) {
  const errors = []
  for (const variableName of REQUIRED_VARIABLES) {
    if (!environment[variableName]?.trim()) {
      errors.push(`${variableName} is required`)
    }
  }

  const endpoint = environment.PLASMO_PUBLIC_FIREHOSE_API_ENDPOINT_URL?.trim()
  if (endpoint) {
    try {
      const url = new URL(endpoint)
      if (url.protocol !== "https:") {
        errors.push("PLASMO_PUBLIC_FIREHOSE_API_ENDPOINT_URL must use HTTPS")
      }
    } catch {
      errors.push("PLASMO_PUBLIC_FIREHOSE_API_ENDPOINT_URL must be a valid URL")
    }
  }

  return errors
}

export function loadProductionEnvironment(
  processEnvironment = process.env,
  envFile = ".env.production"
) {
  const fileEnvironment = existsSync(envFile)
    ? parseEnvironmentFile(readFileSync(envFile, "utf8"))
    : {}
  return { ...fileEnvironment, ...processEnvironment }
}

const isMain = process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) {
  const errors = validateProductionEnvironment(loadProductionEnvironment())
  if (errors.length > 0) {
    console.error(`Production build environment is invalid: ${errors.join("; ")}`)
    process.exitCode = 1
  } else {
    console.log(`Production build environment validated (${REQUIRED_VARIABLES.join(", ")})`)
  }
}
