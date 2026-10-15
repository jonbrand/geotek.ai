# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Geotek.ai is a legal-rural WebGIS platform. A land surveyor (agrimensor) publishes georeferenced perimeters, overlap analyses, memorials and evidence as an interactive **case**. The lawyer who hired them can then open it on a map without any GIS knowledge. The product organizes and presents technical evidence with traceability (SHA-256 of originals, immutable versions, responsible technician + ART). It does **not** certify anything.

**Current stage: lean MVP, browser only, no backend.** The app does three things. (1) The user drags in GeoJSON/KML/KMZ files and sees the perimeters on the map, with the area of each one and the overlap between them in hectares. (2) It exports a print-ready A4 map (`window.print()` + `@media print`). (3) It shares a read-only link that carries the whole case, compressed into the URL fragment (`#c=…`). Accounts, the backend, PostGIS, SHP/DXF and public layers come later, from the target architecture below. The product vision, functional requirements (RF-ING, RF-GIS, RF-ANL, RF-DOC, RF-CAS, RF-EXP, RF-ACC), architecture, data model and roadmap are all in [documento-base-webgis-juridico-rural.md](documento-base-webgis-juridico-rural.md). Read the relevant section before implementing a feature. The project language is Brazilian Portuguese: UI text, test descriptions, comments and docs.

## Commands

The project runs in a Dev Container (Node 22). `node_modules` lives in a named volume, and dependencies are installed on container creation.

```sh
npm run dev          # dev server on http://localhost:8080
npm run build        # production build to dist/
npm run lint         # ESLint
npm test             # Vitest, single run
npm run test:watch   # Vitest watch mode
npx vitest run src/test/App.test.tsx   # single test file
npx vitest run -t "renderiza"          # tests matching a name
npx shadcn@latest add <component>      # add shadcn/ui components on demand (into src/components/ui)
```

## Frontend setup

- Vite + React 18 + TypeScript (SWC), Tailwind CSS + shadcn/ui (slate, CSS variables in `src/index.css`), and `cn()` in `src/lib/utils.ts`.
- `@/` is an alias for `src/`. It is configured separately in `vite.config.ts`, `vitest.config.ts` and `tsconfig.app.json`, so keep all three in sync.
- TypeScript is **not** strict (`strict`, `noImplicitAny` and unused checks are off). ESLint turns off `no-unused-vars`.
- Vitest uses jsdom with globals. Tests match `src/**/*.{test,spec}.{ts,tsx}`. `src/test/setup.ts` loads jest-dom and stubs `window.matchMedia`.

## Lean MVP code map

- `src/lib/geo/`: reading files (`ler-arquivo.ts`), legal area (`area.ts`), overlap (`sobreposicao.ts`), contour validation (`validar.ts`). Pure and tested in `src/test/lib/`.
- `src/lib/link.ts`: case ↔ URL fragment (lz-string, format v3 with points/lines/attributes/overlay frames/notes, still reads v1 and v2, 30 000 character limit). `src/lib/captura.ts` + `src/components/FolhaImpressao.tsx` produce the PDF page.
- `src/components/Mapa.tsx`: MapLibre 6. It opens on real satellite imagery (Esri World Imagery + place names), with a "Satélite / Mapa" button for OSM streets. Both basemaps live in one style (`estiloBase` in `src/lib/mapa.ts`), and switching only changes visibility. The outline casing is white on satellite and dark on streets (`CASCO_DO_FUNDO`). It works without a key, but commercial use requires `VITE_ESRI_KEY` (see `.env.example`). The PDF cites `ATRIBUICAO_FUNDO`. `vite.config.ts` excludes `maplibre-gl` from `optimizeDeps` because its worker breaks otherwise. Rotation is disabled (the PDF's north arrow depends on it), and `preserveDrawingBuffer` is on so the canvas can be captured.
- GeoJSON/KML are already lon/lat (WGS 84 ≈ SIRGAS 2000), so there is no ambiguous CRS yet. Area: `proj4` into the property's SIRGAS 2000 / UTM zone + shoelace; if the polygon crosses two zones, it uses `geographiclib-geodesic`.
- `lerArquivo` returns `{ perimetros, elementos, plantas, observacoes, documento, pastas, avisos }`. Rules that protect the numbers:
  - a path that closes to within 0.5 m becomes an area;
  - a `GroundOverlay` becomes a `Planta`, never a lot (the image comes from the KMZ);
  - polygons from the same placemark are merged into a `MultiPolygon`;
  - the XML `encoding` is respected (ISO-8859-1);
  - swapped latitude/longitude is an error, not an automatic fix.

  Whatever cannot be used goes into `avisos`, shown under "O que veio no arquivo". Photos and overlay images are `blob:` URLs, session-only (they do not fit in the share link). Polygons become `Perimetro` (area/overlap). Points and lines become `Elemento`. Both carry `atributos` (ExtendedData, properties and two-column tables from the description), `descricao` (always plain text: the file's HTML is never rendered as HTML), `pasta` (KML folder path) and the color from the file's style. The click-to-open info card is built in `src/lib/ficha.ts`, and the map popup uses `textContent`.
- Opening the app with no shared link automatically loads the fictional demo case: `public/exemplos/demarcatoria-sorriso.kml` (folders, styles, attributes, stream, landmarks) plus the metadata in `src/lib/exemplo.ts`. The file is generated by `python3 scripts/gerar-exemplo.py`, which is deterministic. Edit the script, not the KML, and `src/test/lib/exemplo.test.ts` checks the areas.
- Lot colors: `PALETA_LOTES` in `src/lib/caso.ts` (blue, teal, gold), validated all-pairs for color blindness against the dispute red (`COR_DISPUTA`). The file's color is ignored for lots; lots get the first free slot, and from the 4th on they are gray, told apart by `TRACOS` (dash pattern). The map fills only the exclusive part of each lot (`calcularPartesExclusivas`); the outline is the full perimeter, with a dark casing. `AmostraLote` is the shared swatch for the map, panel and PDF. Re-validate before changing the palette.
- Tests that render `App` must mock `@/components/Mapa` (there is no WebGL in jsdom).

## Target architecture (from the product doc, §9–§11)

The doc specifies Next.js, but **the decision is to stay on Vite** (SPA + FastAPI API when the backend arrives).

- **Map:** MapLibre GL JS (not Leaflet/Mapbox/OpenLayers).
- **Backend:** Python + FastAPI. Heavy work (GDAL/Shapely/pyproj) runs in an RQ worker on Redis. PostgreSQL + PostGIS is the source of geometric truth. Martin serves MVT tiles, with PMTiles for large public layers. Files live in S3 with versioning. PDFs are made by headless Chromium rendering an HTML template. Everything runs on a single VPS with Docker Compose in a Brazilian region.
- **CRS rules (critical for legal validity):**
  - Store data canonically in EPSG:4674 (SIRGAS 2000).
  - Use EPSG:3857 only for tile display.
  - Compute legal areas in the property's SIRGAS 2000 UTM zone (e.g. EPSG:31982). **Never compute area in Web Mercator.**
  - Polygons that span two zones use geodesic calculation.
  - Keep the original CRS and the transformation path as metadata.
  - Display-simplified geometries live in a separate column and are never used for calculation.
- **Immutability:** a published `VersaoAnalise` is frozen. A DB trigger and the app both refuse writes to it. A correction means a new version, and old versions are never deleted. User annotations (`Anotacao`) never enter a published version.
- **Ingestion:** an ambiguous CRS is always confirmed by a human. The worker never decides on its own.

## UX principle: "GIS sem jargão" (§12.4)

Text a lawyer sees must never contain EPSG codes, "shapefile", "datum", "buffer", "geometria" or "camada raster". Technical detail goes behind a "detalhes técnicos" link. Errors are a plain-language sentence plus the location on the map plus a suggested action, never raw stack traces or "Erro 500". Numbers use Brazilian formatting (`512,3400 ha`).
