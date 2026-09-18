// Local fixture preview only. No credentials or external services required.
const result = await Bun.build({
  entrypoints: ["./companion/preview.tsx"],
  target: "browser",
  loader: { ".woff2": "file", ".png": "file" },
  outdir: "./build/companion-preview",
  minify: false
})
if (!result.success) {
  console.error(result.logs)
  process.exit(1)
}
const assets = new Map(
  result.outputs.map((output) => [output.path.split("/").pop()!, output])
)
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 4177,
  async fetch(request) {
    const name = new URL(request.url).pathname.slice(1)
    if (name === "" || name === "index.html")
      return new Response(
        '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Community Archive · Companion preview</title><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script type="module" src="/preview.js"></script></body></html>',
        { headers: { "Content-Type": "text/html" } }
      )
    if (name === "favicon.ico") return new Response(null, { status: 204 })
    const asset = assets.get(name)
    return asset
      ? new Response(Bun.file(asset.path))
      : new Response("Not found", { status: 404 })
  }
})
console.log(`Companion preview: ${server.url}`)
