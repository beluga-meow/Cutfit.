# Hair assets for the 3D head simulator

The viewer builds your head from the MediaPipe face mesh and your photo, then
attaches hair from this folder. **Nothing here ships as a realistic hair model
yet** — the manifest contains one clearly-labelled procedural example so the
pipeline can be tested end to end.

## What is in the box

| File | What it is | Licence |
| --- | --- | --- |
| `manifest.json` | the list of styles the viewer offers | CC0 (schema) |
| *(no `.glb` yet)* | — | — |

The built-in `"builtin": "cards"` example draws alpha hair cards at runtime. It
is honest about being an approximation: cards, not strands, and no real
hairline texture. It is there so you can verify the loader, the sliders, the
lighting and the screenshot export before buying or modelling assets.

## Adding a real style

1. Put the model in this folder, e.g. `assets/hair/textured-crop.glb`.
2. Add an entry to `manifest.json`:

```json
{
  "id": "textured-crop",
  "name": "Textured Crop",
  "file": "textured-crop.glb",
  "license": "CC BY 4.0 — https://example.com/asset",
  "author": "Studio name",
  "anchors": { "scale": 1.08, "position": [0, 0.02, -0.04], "rotation": [0, 0, 0] },
  "defaults": { "length": 0.4, "fade": 0.6, "color": "#2b2320" }
}
```

3. Reload the 3D tab. The style appears in the “Hair style” dropdown.

### Requirements for a GLB that looks right

- **Units:** a head of roughly 1 unit height, scalp at the origin. The viewer
  scales by `anchors.scale`, so start at 1.0 and adjust.
- **Placement:** hair must sit on the scalp of a head centred at `(0, 0, 0)`
  with the face looking down `+Z`. Use `anchors.position` / `anchors.rotation`
  to nudge it.
- **Material:** alpha-blended or alpha-tested textures (hair cards or strands).
  Leave the material unlit or standard; the viewer overrides `color` so the
  colour picker works. Keep the base texture light/greyscale so tinting reads.
- **Size:** under ~8 MB per style. glTF-Binary, textures embedded.
- **Licence:** record it in `license`. Do not add assets you cannot redistribute.

## Where to get realistic hair (checked pointers, not endorsements)

- **Model it:** Blender hair curves converted to cards (XGen/Geometry Nodes),
  then export glTF. This is the only way to get *your* styles exactly.
- **Buy/licence:** Sketchfab and TurboSquid have hair-card heads with clear
  licences; check that the licence allows commercial web use and modification.
  Poly Haven does **not** currently publish hair models, so it is not a source
  for this.
- **Scan your own:** a 3D scan of a mannequin with a real wig is the cheapest
  route to one convincing, ownable style.

## What is still missing for realism

1. A real hair-card GLB with a photographed alpha texture (at least one men's
   crop and one longer style).
2. A hair shader tuned per asset. The viewer sets `MeshPhysicalMaterial`
   anisotropy/sheen, which helps, but anisotropy direction depends on the
   texture's strand direction — so assets must be authored with that in mind.
3. Ambient occlusion baked per style (the viewer only has soft shadows plus a
   contact shadow).

Until those exist, the 3D tab tells the user that the head is plain scalp and
points them to the AI photo preview. That is deliberate: faking realistic hair
with flat shapes would be worse than saying so.
