# Terrain Web MVP (2026-10-23)

## Scope

A first, owner-only integration of the Terrain Web product tier into the
existing map page. It is deliberately a **CPU procedural prototype**, not the
full 450 Myr / conditional-GAN Terrain pipeline:

- 2048×1280 PNG terrain: warped Voronoi plates, convergent/divergent boundary
  classification, orogenic uplift belts with ridged crests, hydraulic erosion,
  filled-depression hydrology, output-resolution hypsometric color/snow LUT,
  hillshade, curved main stems + tributaries, optional baked Latin labels,
  cartouche, compass and scale bar
- deterministic `seed` + three style presets: `atlas`, `parchment`,
  `topographic`
- generated image is stored as the world's `map_background`
- labels are returned as data and rendered as a screen-space overlay; the UI
  can convert them into editable `MapMarker` rows
- the existing map markers, dragging, editing, upload and remove flows are
  unchanged

Measured locally on the checked-in Python 3.14 venv: roughly **12.3–12.6 s**
for one 2048×1280 render with the balanced **700×438 simulation grid** (plus
a per-output-pixel elevation LUT, a per-render procedural ridge texture,
hillshade and detail symbols). The previous 480×300 grid produced ~7.3–7.6 s. The 700 grid is a
quality/time compromise and no longer meets the eight-second budget. On a 2C2G host this should be
treated as a CPU prototype; the production target remains the cached SeedPack +
GPU worker design in the research notes.

## API

`POST /api/worlds/<world_slug>/map/terrain-web/`

Owner only. JSON:

```json
{"seed": 4217, "style": "atlas"}
```

`seed` may be omitted/blank (random), `style` defaults to `atlas`. Response:

```json
{
  "background_url": ".../terrain-web-4217-atlas.png?v=...",
  "seed": 4217,
  "style": "atlas",
  "width": 2048,
  "height": 1280,
  "elapsed_ms": 7560,
  "labels": [{"name": "Orin Sound", "x": 0.43, "y": 0.22, "kind": "city"}],
  "bake_labels": false,
  "prototype": true
}
```

The `?v=` suffix is a cache-buster; the stored filename is stable for a given
seed/style so regenerating the same world replaces the previous asset. The
generation metadata (seed/style/size/labels/bake flag) is persisted in
`World.terrain_web`, so a page reload restores the label overlay and the
sidebar status.

## UI

Map page → sidebar → **Terrain Web**:

- seed input + random button
- style select (default `Atlas · 自然地形`; Parchment and Topographic remain
  available)
- “生成地形底图”
- elapsed time / label count / prototype note
- the map viewport is locked to the 16:10 generated image, so vector labels
  and editable pins share the same coordinate space (no object-fit crop skew)

The generated map is marked with a `Terrain Web` badge. The UI requests
`bake_labels: false`, renders the returned labels as a vector overlay, and
offers “把 N 个地名转为图钉” to create editable markers. Standalone API callers
can keep the default `bake_labels: true` to receive a self-contained PNG.

## Tests

- `TerrainWebGeneratorTests`: deterministic PNG, valid signature, bounded
  render, invalid style.
- `TerrainWebApiTests`: owner-only, save/replace background, labels, invalid
  seed/style.
- Full backend suite: 115 tests pass.

## Known limits / next steps

1. Labels are overlay data; converting them to markers is explicit and one-way
   (no label/geometry sync back to the generator). Existing marker labels hide
   matching overlay labels, so a reload does not duplicate them.
2. No real 450 Myr simulation or GAN; the generator is a visual prototype.
3. No time slices or 3D export yet. Alpine snow is a stylized elevation mask,
   not a physical glacier model; the uplift field is still schematic.
4. Production should move generation off the web process to a worker and
   cache SeedPacks; 2C2G should remain the control plane.
5. The map page crops wide images on a tall studio canvas; labels/cartouche are
   constrained to a central safe area. A future layout may expose a 16:10
   viewport or a dedicated Terrain canvas.

## 3D preview (experimental)

The same terrain output now includes a persisted `heightmap` (512×320 grayscale
PNG, base64 in `World.terrain_web`) and a lazy-loaded Three.js preview:

- `3D β` toggles the map canvas into a real-time terrain mesh
- height-coloured vertices, directional light, orbit/zoom
- movable sun azimuth and elevation sliders
- ocean plane and a persistent 2D fallback

The 3D mesh is intentionally marked experimental: the current heightmap is a
lowland-normalised displacement of the 700×438 simulation, so steep mountain
belts still read as spikes/curtains rather than a fully sculpted ridge mesh.
The 2D atlas render remains the production path.

## Direct mesh payload

The 3D beta now receives a dedicated `mesh` payload from the backend instead of
decoding a PNG heightmap in the browser:

- `mesh`: base64 bytes, 256×160
- `mesh_width` / `mesh_height`
- 0 = water, positive values = land elevation with a coastal shelf
- Three.js builds a `PlaneGeometry` from the grid and flips the height axis for
  the plane's -90° X rotation
- ocean plane, vertex colours, and movable sun direction/elevation

The mesh is still marked beta: the current elevation field produces steep
mountain walls and a visually flat lowland shelf. A future mesh needs a proper
coast distance transform and multi-resolution landform detail.

### Micro relief pass

The 3D beta now has two extra front-end detail passes on top of the direct
height mesh:

- low-amplitude FBM micro displacement on land vertices
- a baked DataTexture normal map derived from the height grid, applied with a
  small `normalScale`

These add surface light response without adding more simulation cells. The
remaining visual gap is still the coarse 256×160 height field and the flat
lowland shelf, not the lighting setup.

## 3D mesh budget

Measured `generate_terrain` on the local workstation (total 2D + 3D):

- mesh 768×480: ~14.7 s
- mesh 640×400: ~13.9–15.5 s
- mesh 576×360: ~14.0–15.0 s
- mesh 512×320: ~13.0–15.5 s depending on machine load

Because the 2D 2048×1280 render dominates and the workstation was heavily
loaded, 640/576 do not leave a defensible margin for a 2 GB / 2-core server.
The shipped mesh remains 512×320 until the target server is benchmarked; this
is a performance constraint, not a missing feature.
