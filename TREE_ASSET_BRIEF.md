# Tree Asset Brief — Western & Eastern WA Roadside Pass

Target consumer: Codex (image generation). Drop generated PNGs into the listed paths; AssetManifest.js + GameScene.js + RouteData.js are already wired to reference these keys.

## Global rules (apply to every asset below)

- **Format:** transparent PNG. No background fill, no shadow plate, no ground disk under the trunk.
- **Crop:** trunk base centered on the bottom edge of the canvas. The renderer anchors trees bottom-center, so any empty pixels below the trunk push the tree into the air.
- **Padding:** ≤ ~6% transparent margin on each side. Tighter is better; collision width fraction is 0.40 of the rendered sprite, so excessive side padding makes the hitbox feel wrong.
- **Perspective:** straight-on / slightly-below eye level (the player is in a car looking out the side window). Not aerial, not isometric.
- **Lighting:** flat-to-moderate Pacific Northwest overcast light. No hard rim-lights, no neon, no stylized cartoon outlines. These need to read alongside the existing photo-realistic Codex buildings — not against them.
- **Variants:** at least 2 per species so the scenery loop doesn't visibly repeat. Variant differences should be silhouette-level (lean, branch density, height proportion), not just color swaps.

## Reference dimensions

Existing trees on disk and the size band they hit. Match these so new species sit visually consistent.

| File | Pixels (W × H) | Aspect | Notes |
|---|---|---|---|
| trees/hemlock1.png | 1740 × 2654 | 0.66 | Tall conifer reference. Aim near this for full-grown species. |
| trees/cedar2.png | 894 × 1582 | 0.57 | Mid-sized conifer reference. |
| trees/hemlock2.png | 635 × 768 | 0.83 | Smaller / squatter variant. |

**Target spec for new tall conifers:** ~1500–1800 px wide × ~2400–2800 px tall, transparent PNG.
**Target spec for shorter pines / shrubs:** ~900–1400 px wide × ~1100–1700 px tall.

## Urban broadleaves (mile 0–14) — West Seattle homes, downtown Seattle, Mercer Island, Bellevue

These are the planted-street / front-yard / park trees that fill in the gaps between the photo buildings. They're shorter than the wild conifers and have wider crowns.

### A. Bigleaf Maple — `tree_bigleaf_maple_1`, `tree_bigleaf_maple_2`
- Path: `public/assets/trees/bigleaf_maple_1.png`, `public/assets/trees/bigleaf_maple_2.png`
- Reference: *Acer macrophyllum* — the iconic Pacific Northwest maple. Massive lobed leaves (~12 inches), broad rounded crown, often moss-draped lower limbs.
- Silhouette: wider than tall — crown spreads ~1.2× the height. Smooth gray bark on the trunk, branches forking irregularly.
- Color: deep green summer foliage. (Fall variant optional but not required.)
- Target px: ~1600 × 1800 (slightly wider than tall — opposite aspect from conifers).
- Variant 2: more weathered specimen, denser canopy, slight lean.

### B. Vine Maple — `tree_vine_maple_1`
- Path: `public/assets/trees/vine_maple_1.png`
- Reference: *Acer circinatum* — multi-trunked understory maple, smaller (15–25 ft in life).
- Silhouette: clumpy, multi-stem, smaller-than-conifer footprint. Good for yard infill.
- Target px: ~1100 × 1300.

## Western Washington (mile 14–88) — Bellevue → Issaquah → Snoqualmie Pass

Mature wet-side conifers. Dense, deep-green, often moss-tinged.

### 1. Douglas Fir — `tree_douglas_fir_1`, `tree_douglas_fir_2`
- Path: `public/assets/trees/douglas_fir_1.png`, `public/assets/trees/douglas_fir_2.png`
- Reference: *Pseudotsuga menziesii*, the signature Pacific NW tree.
- Silhouette: tall, slightly tapered conical-but-irregular crown, drooping lower branches, dark green needles with a slight blue tint.
- Trunk: visible bark column on the lower third — coarse, deeply furrowed, reddish-brown.
- Variant 2: leaner, slightly windward-tilted; ~10% shorter; bottom branches more uneven.

### 2. Western Hemlock (Tsuga) — `tree_hemlock_3` (NEW variant)
- Path: `public/assets/trees/hemlock3.png`
- Reference: *Tsuga heterophylla*, droopy leader (the top bends over), fine soft needles.
- Existing `hemlock1.png` / `hemlock2.png` cover this species but only 2 variants — add ONE more to break the repeat cycle in dense `cascades` segments. Make it slightly younger / narrower than hemlock1, with a more pronounced bent leader.

### 3. Western Red Cedar — `tree_red_cedar_1`, `tree_red_cedar_2`
- Path: `public/assets/trees/red_cedar_1.png`, `public/assets/trees/red_cedar_2.png`
- Reference: *Thuja plicata*. Flat-spray scale-like foliage, often draping in fronds, broad pyramidal silhouette.
- Trunk: shaggy reddish-brown fibrous bark, often slightly buttressed at the base.
- Variant 2: older specimen — broader crown, some dead branches at the bottom showing through, slightly fluted trunk.
- The existing `cedar1.avif` / `cedar2.png` may be retired or kept as additional variants. Match these new ones to the photo-realistic style of the buildings.

## Eastern Washington (mile 88–195) — Cle Elum → Ellensburg → Vantage → Columbia Basin

Dry-side conifers. Sparser, redder bark, more open crowns. Mixed with sage shrubland after Vantage.

### 4. Ponderosa Pine — `tree_ponderosa_1`, `tree_ponderosa_2`
- Path: `public/assets/trees/ponderosa_1.png`, `public/assets/trees/ponderosa_2.png`
- Reference: *Pinus ponderosa*. Tall, straight, open crown, very visible orange/cinnamon plated bark (the "jigsaw-puzzle" pattern), long bundled needles.
- Silhouette: less full than a doug fir — bare lower trunk, foliage concentrated in the upper third to half.
- Variant 2: shorter (younger) specimen with denser mid-crown, foliage starting lower.

### 5. Western White Pine — `tree_white_pine_1`, `tree_white_pine_2`
- Path: `public/assets/trees/white_pine_1.png`, `public/assets/trees/white_pine_2.png`
- Reference: *Pinus monticola*. Slender, regular whorled branches, softer blue-green needles than ponderosa, slightly more conical.
- Silhouette: cleaner, more uniform tiering of branches than the irregular ponderosa.
- Variant 2: storm-damaged / slightly asymmetric crown — adds visual variety in scattered placements.

### 6. Shrub — Sagebrush / Rabbitbrush — `shrub_sage_1`, `shrub_sage_2`, `shrub_rabbitbrush_1`
- Path: `public/assets/trees/sage_1.png`, `public/assets/trees/sage_2.png`, `public/assets/trees/rabbitbrush_1.png`
- Reference: *Artemisia tridentata* (sage — silvery-gray, low and round, ~3–5 ft tall in life) and *Ericameria nauseosa* (rabbitbrush — taller, yellowish-green with bright yellow flower tops in late summer).
- Silhouette: low, round, irregular mounds. NOT tree-shaped.
- Target px: ~900 × 700 (wider than tall — these are squat).
- The renderer applies a 0.50 collision width fraction to `'shrub'` sprites (vs 0.40 for `'tree'`), so a slightly wider canvas read is fine.
- Variant 2 (sage_2): smaller / more weathered specimen.

## Filename + manifest keys summary

These keys are already (or will be) registered in `src/systems/AssetManifest.js`:

```
tree_douglas_fir_1     assets/trees/douglas_fir_1.png
tree_douglas_fir_2     assets/trees/douglas_fir_2.png
tree_hemlock3          assets/trees/hemlock3.png        (added — new variant)
tree_red_cedar_1       assets/trees/red_cedar_1.png
tree_red_cedar_2       assets/trees/red_cedar_2.png
tree_ponderosa_1       assets/trees/ponderosa_1.png
tree_ponderosa_2       assets/trees/ponderosa_2.png
tree_white_pine_1      assets/trees/white_pine_1.png
tree_white_pine_2      assets/trees/white_pine_2.png
shrub_sage_1           assets/trees/sage_1.png
shrub_sage_2           assets/trees/sage_2.png
shrub_rabbitbrush_1    assets/trees/rabbitbrush_1.png
```

## When the assets land

1. Drop the PNGs at the listed paths.
2. `npm run dev` — Phaser preloads them via the existing manifest.
3. Trees will spawn automatically in their region bands per RouteData.js wiring (see `regionalTreePool` / `_regionTreePool` helper).
4. If a tree reads too small/tall, tune the `heightMult` / `maxH` values in `SCENERY_IMAGE_PROFILES` (top of `src/scenes/GameScene.js`). Existing conifer profile baseline: `{ heightMult: 2.4, maxW: 220, maxH: PLAYER_CAR_VISUAL_H * 4.2, minOffset: 1.85, groundDrop: 0.010 }`.
