# Sticonize

Turn any SVG icon into a hand-drawn scribble. Drop a file, paste SVG code, or
search the Iconify library — get it back redrawn freehand and export it as SVG,
PNG, a Vue component, a React component, or the whole queue as a ZIP.

Live at **[sticonize.com](https://sticonize.com/)**. Everything runs in the
browser; dropped files are never uploaded anywhere.

## Run it

```bash
npm install
npm run dev      # vite dev server
npm run build    # static bundle into dist/
npm run preview  # serve the build
npm test         # node --test, no DOM needed
```

No backend, no config, no env vars. `dist/` is a folder of static files — drop
it on any host.

## Docker

```bash
docker build -t sticonize .
docker run --rm -p 3000:3000 sticonize
```

Multi-stage: Node builds, nginx serves. The runtime image is
`nginx-unprivileged`, so it runs as UID 101 with no extra plumbing. It listens
on 3000 — the port most PaaS proxies (Coolify among them) assume by default —
so map it to 80 at the proxy or the host.

## How it works

1. `parseSvg` reads the file with `DOMParser`, strips anything executable, then
   mounts it off-screen so the browser can resolve transforms
   (`getScreenCTM`) and inherited paint (`getComputedStyle`).
2. Every `path`/`rect`/`circle`/`ellipse`/`line`/`polyline`/`polygon` is reduced
   to a single `d` string plus a flat matrix. Shapes inside `defs`, `clipPath`,
   `mask`, `marker`, `pattern` or `symbol` are skipped.
3. `buildSvg` feeds each `d` to [Rough.js](https://roughjs.com/) and serializes
   the result by hand — roughness, stroke width and hachure gap are scaled by
   the viewBox and by each shape's own transform, so a 1000-unit icon and a
   24-unit icon sketch the same.

Six presets ship in `PRESETS`: wireframe, hachure, thick, charcoal, dots, ink.

## Layout

| Path | What |
|---|---|
| [src/scribble.js](src/scribble.js) | Parsing, sketching, and every exporter (SVG/PNG/Vue/React/ZIP). No framework code. |
| [src/App.vue](src/App.vue) | Queue state, the live preview, download orchestration. |
| [src/components/](src/components/) | Header, input panel (drop/paste/Iconify search), controls panel. |
| [src/i18n.js](src/i18n.js) | English, Portuguese and Dutch, as one plain object. |
| [src/theme.js](src/theme.js) | Dark/light, persisted to `localStorage`. |
| [tests/](tests/) | `node --test` over the pure geometry and export functions. |

Dependencies: `vue` and `roughjs`. That's it.

## Security notes

Untrusted SVG has to touch the live DOM — measuring transforms requires layout.
Two things keep that safe, and both matter:

- `parseSvg` removes `script`, `style`, `foreignObject`, `desc`, `title`,
  `image`, `use` and the SMIL animation elements, plus every `on*` attribute,
  *before* insertion. `desc`, `title` and `foreignObject` are HTML integration
  points — inside them the parser switches back to full HTML, so they are not
  optional.
- The CSP in [index.html](index.html) is the second layer. Keep it if you fork
  this, and if you serve the app from your own host, send it as a header too.

The Iconify search box sends the typed query to `api.iconify.design`. Local
files never leave the browser, but search terms do.

## Icon licensing

Icons pulled through Iconify keep their original set's license, which varies per
set. Vue and React exports carry a comment with the source and a reminder to
check it before shipping. Sticonize's own license below covers the code, not the
icons you run through it.

## License

MIT — see [LICENSE](LICENSE).
