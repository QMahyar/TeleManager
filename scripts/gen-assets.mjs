// Asset generator — turns the "signal beacon" logomark into the full favicon /
// PWA / OG icon set. Dev-only (run with `node scripts/gen-assets.mjs`); requires
// the `sharp` devDependency. Outputs to apps/web/public so Vite copies them into
// the build and the FastAPI server serves them from there.
//
// The beacon geometry is kept identical to apps/web/src/lib/beacon.ts and the
// in-UI <BrandMark>, so the favicon, the app icon, and every status light read
// as one system. Edit the geometry in ONE place if it changes.

import { mkdir, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = resolve(__dirname, "..", "apps", "web", "public")

// sharp is a devDependency of apps/web (not the repo root), so resolve it from
// there rather than relying on root-level module resolution.
const require = createRequire(resolve(__dirname, "..", "apps", "web", "package.json"))
const sharp = require("sharp")

// Brand palette (fixed hex — favicons render outside the DOM so they can't use
// the app's CSS custom properties). Teal signal on warm-charcoal, matching the
// Console theme's default accent + dark card surface.
const TEAL = "#3FB8A6"
const TILE = "#211E1B"
const TILE_EDGE = "#322E29"
const OG_BG = "#1A1714"
const INK = "#ECE7DF"
const SUBTLE = "#8C857B"

// The beacon's inner markup at a 24×24 viewBox, in one literal colour. Mirrors
// beacon.ts beaconMarkup(). cx/cy 12, core r2.6, inner ring r5.3, broken outer arc.
function beacon(color) {
  return (
    `<circle cx="12" cy="12" r="2.6" fill="${color}"/>` +
    `<circle cx="12" cy="12" r="5.3" fill="none" stroke="${color}" stroke-width="2"/>` +
    `<path d="M5.15 17.2 A 8.6 8.6 0 1 1 18.85 17.2" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>`
  )
}

// A rounded-tile app icon: charcoal tile + centred beacon. `pad` is the share of
// the tile kept clear around the mark (larger for maskable icons whose corners
// get cropped to a circle on Android).
function iconSvg(size, { pad = 0.2, radius = 0.22, bleed = false } = {}) {
  const r = Math.round(size * radius)
  const inner = size * (1 - pad * 2)
  const offset = size * pad
  const tile = bleed
    ? `<rect width="${size}" height="${size}" fill="${TILE}"/>`
    : `<rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="${r}" ry="${r}" fill="${TILE}" stroke="${TILE_EDGE}" stroke-width="2"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${tile}<g transform="translate(${offset} ${offset}) scale(${inner / 24})">${beacon(TEAL)}</g></svg>`
}

// Adaptive favicon: a small rounded tile so the mark keeps contrast on any tab
// bar. Authored crisp at 32px.
function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" ry="7" fill="${TILE}"/><g transform="translate(5 5) scale(0.9167)">${beacon(TEAL)}</g></svg>`
}

// Open Graph / social + window preview: 1200×630 dark card with the lockup.
function ogSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="22%" cy="38%" r="60%">
      <stop offset="0%" stop-color="${TEAL}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${TEAL}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="${OG_BG}"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <g transform="translate(140 232) scale(7.3)">${beacon(TEAL)}</g>
  <text x="312" y="300" font-family="'JetBrains Mono','DejaVu Sans Mono',monospace" font-size="84" font-weight="700" fill="${INK}" letter-spacing="-2">telemanager</text>
  <text x="316" y="356" font-family="'JetBrains Mono','DejaVu Sans Mono',monospace" font-size="30" fill="${TEAL}" letter-spacing="6">LOCAL SESSION OPS</text>
  <text x="316" y="408" font-family="'DejaVu Sans',sans-serif" font-size="27" fill="${SUBTLE}">Local-first manager for your own Telegram accounts.</text>
</svg>`
}

// Minimal PNG-in-ICO writer (sharp can't emit .ico). The ICO format permits
// PNG-encoded entries, so we wrap the rendered PNGs in an ICONDIR + entries.
function pngToIco(images) {
  const count = images.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(count, 4)
  const entries = Buffer.alloc(16 * count)
  let offset = 6 + 16 * count
  images.forEach((img, i) => {
    const e = i * 16
    entries.writeUInt8(img.size >= 256 ? 0 : img.size, e + 0)
    entries.writeUInt8(img.size >= 256 ? 0 : img.size, e + 1)
    entries.writeUInt8(0, e + 2) // palette
    entries.writeUInt8(0, e + 3) // reserved
    entries.writeUInt16LE(1, e + 4) // colour planes
    entries.writeUInt16LE(32, e + 6) // bits per pixel
    entries.writeUInt32LE(img.data.length, e + 8)
    entries.writeUInt32LE(offset, e + 12)
    offset += img.data.length
  })
  return Buffer.concat([header, entries, ...images.map((img) => img.data)])
}

async function png(svg, size) {
  return sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()
}

async function main() {
  await mkdir(PUBLIC_DIR, { recursive: true })
  const out = (name) => resolve(PUBLIC_DIR, name)

  // Vector favicon (crisp at any size, adapts in the tab bar).
  await writeFile(out("favicon.svg"), faviconSvg(), "utf8")

  // Raster favicons + platform icons.
  await writeFile(out("favicon-16.png"), await png(faviconSvg(), 16))
  await writeFile(out("favicon-32.png"), await png(faviconSvg(), 32))
  await writeFile(out("apple-touch-icon.png"), await png(iconSvg(180, { pad: 0.16 }), 180))
  // Maskable PWA icons: full-bleed tile with generous padding for the circle crop.
  await writeFile(out("icon-192.png"), await png(iconSvg(192, { pad: 0.26, bleed: true }), 192))
  await writeFile(out("icon-512.png"), await png(iconSvg(512, { pad: 0.26, bleed: true }), 512))

  // Multi-resolution .ico for legacy/Windows contexts.
  const ico16 = await png(faviconSvg(), 16)
  const ico32 = await png(faviconSvg(), 32)
  const ico48 = await png(faviconSvg(), 48)
  await writeFile(
    out("favicon.ico"),
    pngToIco([
      { size: 16, data: ico16 },
      { size: 32, data: ico32 },
      { size: 48, data: ico48 },
    ])
  )

  // Social / window preview.
  await writeFile(out("og.png"), await sharp(Buffer.from(ogSvg())).png().toBuffer())

  // Web app manifest.
  const manifest = {
    name: "TeleManager",
    short_name: "TeleManager",
    description: "Local-first manager for your own Telegram accounts.",
    start_url: "/",
    display: "standalone",
    background_color: OG_BG,
    theme_color: TILE,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  }
  await writeFile(out("manifest.webmanifest"), JSON.stringify(manifest, null, 2), "utf8")

  console.log("Generated assets in", PUBLIC_DIR)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
