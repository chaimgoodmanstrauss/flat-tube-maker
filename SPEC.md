# Flat Tube Maker — strip coordinates and teeth (spec, 2026-11-06)

This is the intended model. Where the code disagrees, the code is wrong.

## Strip coordinates (s, t)

- `s` = distance along the curve in space (unit speed, i.e. arclength of the centre curve, not the curve parameter).
- `t` runs from `-w_i/2` to `+w_i/2`, where `w_i` is the length of polygon edge `i` in the polygon view, measured
  along the edge from its midpoint (`t = 0` is the midpoint of the segment, wherever that is).
- `n` = the normal pointing back toward the curve (arbitrary if the segment's line passes through the origin in the
  polygon view). `(dt, ds, n)` is right-handed.
- `S_i(s, t)` = the point in space of strip `i` (width `w_i`). Neighbouring strips share their edges:
  `S_i(s, -w_i/2) = S_(i+1)(s, +w_(i+1)/2)`, indices mod the number of edges.

## Teeth (formerly "joints")

- Renamed: joint -> **tooth**.
- Tooth coordinates in the tooth pane: `x` from `-toothwidth/2` to `+toothwidth/2`, `y` up. The tooth pane is always
  drawn with a uniform scale.
- Map tooth -> strip -> space and -> flat pieces:
  - on the `+w_i/2` edge: `tooth(x, y) -> S_i(x + k*toothwidth, y + w_i/2)`
  - on the `-w_i/2` edge, one of (toggle in the tooth pane):
    - **glide**: `S_i(x + (k+1/2)*toothwidth, -y - w_i/2)`
    - **turn**:  `S_i(-x + (k+1/2)*toothwidth, -y - w_i/2)` (k chosen so s stays in range)
- So teeth stick outward from the strip they belong to and interlock with the neighbouring strip.
- Tooth pane: show the mate image (the `-w/2` side map, per the toggle, i.e. `(x + tw/2, -y)` or `(-x + tw/2, -y)`)
  of the tooth path, so the fit can be seen.
- Path pane: a toggle to show the teeth there, interlocking and sticking outward from their strips.

## Concerns

1. **Interlock needs a symmetric tooth.** Across a seam, strip `i+1` cuts along the tooth path and strip `i` cuts
   along its mate image. The two cuts are the same curve only if the (periodic) tooth path is invariant under the
   mate map. A tab with no socket (e.g. the current default dovetail) is not, so the tabs of one piece would lie on
   top of the other piece's paper rather than in a socket. The tooth must contain a tab and the matching socket.
   - For a left-right symmetric tab (dovetail), glide and turn give identical results; the toggle only matters for
     asymmetric teeth (hooks, barbs).
   - Which map works depends on where the tab sits in the cell: tab on `[-tw/2, 0]` + socket on `[0, tw/2]` works with
     glide but not turn; a tab centred at 0 with half-sockets at both ends works with both.
2. **"Toward the curve" vs. the seam rule.** The seam identity `S_i(-w/2) = S_(i+1)(+w/2)` needs every edge's `t`
   direction to agree with the order around the polygon. Defining `t` by "n points back toward the curve" does that
   only when the origin lies on the inner side of every edge's line (origin in the polygon's kernel). For a
   non-convex polygon, a polygon not containing the origin, or the Segment shape, some edges flip and their seams no
   longer match. Proposal: define `t` from the polygon's orientation (outward = polygon outward normal); this is the
   spec's convention whenever the origin is in the kernel, and stays consistent otherwise.
3. **`s` is not flat length.** In the flat development, rulings (`s` = const) are straight, perpendicular to the
   rails, and `t` is true length along them. Along a rail, flat length is `lambda * ds` with
   `lambda = 1 - (curvature in that point's direction) * (distance from the curve)`, which varies along `s` and across
   `t`. Teeth drawn `tw` wide are stretched or squeezed where the curve bends. Both sides of a seam use the same
   `s`, so they still agree exactly on the seam line itself; off the seam (across the tooth height) the two strips'
   stretch differs slightly (paper takes it up). If `lambda <= 0` anywhere in a tooth (tube past the centre of
   curvature), the tooth folds over itself.
   Option: map `x` to arclength along the seam instead of along the curve: teeth keep their drawn width, still match.
4. **Ends of strips.** Every strip shares the same `s` range `[0, L]` (L = curve length), so one global effective
   tooth width `L / round(L / tw)` gives a whole number of teeth on every seam with no partial teeth. (Currently each
   edge refits its own cells and keeps an end margin.)
5. **Splits** (cuts across a strip at `s` = const) are not covered by the spec. Currently they get a plain overlap
   flap and no teeth; proposal: keep that.
6. **Tooth width.** The spec needs `toothwidth` in model units; the UI field for cell width was removed earlier and
   the code forces it to 1. Needs a field again (or a fixed value).
7. **Which pane is the "path pane"?** Probably the 3D curve & tube pane (teeth shown on the tube in each strip's own
   surface, extending past the seam). In the cross-section pane the teeth would only show edge-on as short
   extensions of the edges past the vertices.

## Plan

1. **Geometry core (`geom.js`).** Add curve arclength `s_k` at the samples. Per strip store the midpoint `c_i`, unit
   edge direction `e_i` (from `-` to `+`, from polygon orientation), width `w_i`. Provide
   - `S3(i, s, t) = P(s) + U(s)*(c+t*e).x + V(s)*(c+t*e).y` (3D),
   - `F(i, s, t)` = flat point: the unfolded ruling at `s` (interpolated between samples) at signed length `t` from its
     midpoint, extrapolated past the rails for teeth.
   Strip unfolding stays as is (rulings are already the unfold's triangle edges).
2. **Teeth (`joints.js` -> `teeth.js`).** One function: tooth path -> list of `(s, t)` points along a seam for the `+`
   or `-` edge, using the spec's map and the glide/turn toggle, tiled `k = 0 .. n-1` with the global effective width.
   Piece outline = `+` edge tooth curve, end cut, `-` edge tooth curve reversed, end cut — all through `F`.
   Delete: `layoutFeatures`, `oriented`, `segmentPath`, `frameAt`, `railNormals` sign guessing, `cutPath`, per-edge
   refitting, end margin, `OLD_DEFAULTS`.
3. **Tooth pane (`jointedit.js` -> `toothedit.js`).** Coordinates `x in [-tw/2, tw/2]`, uniform scale, endpoints fixed
   at `(+-tw/2, 0)`. Glide/turn toggle. Overlay the mate image of the path (and neighbouring cells), with the two
   papers shaded, so gaps/overlaps are visible. Tooth width field. New default: dovetail tab + matching socket.
4. **Path pane.** "teeth" toggle drawing the tooth outlines on each strip via `S3` (outline of each strip with its
   teeth, sticking out past the seams).
5. **Rename** joint -> tooth everywhere (UI labels, ids, `state.joint` -> `state.tooth`, files, README). Read an old
   `state.joint` once into `state.tooth`.
6. **Remove vestigial code.** `state.twist` migration; `bishopFrame` twist argument; open-polygon branches
   (`closed` is always true: `seams.mate === null`, `minPts`, `nEdges`); `snapOn` / snap helpers in both editors;
   FlatView `opt.rulings` / `opt.labels` and the "Join" comments; `pruneLayout`; unused `err`, `nSamples`, `polyNote`
   mismatch; View3D `opt.tube` and `reset()`; README text about 180deg rotation and refitting.
7. **Verify.** Seam check: for every seam, the `+` curve of strip `i+1` and the mate curve of strip `i` map to the same
   3D points (`S3`) within tolerance; in the flat, each piece's cut line matches its neighbour's when the neighbour is
   unfolded across the seam. Then browser check on presets (spiral, knot, helix, bend; hexagon, star, segment).
