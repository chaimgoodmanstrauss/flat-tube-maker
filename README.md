# Flat Tube Maker

Open `index.html` (no build, no dependencies).

1. **Cross-section** (left): closed/open polygon in the (U,V) plane of the sweep frame; fixed origin = the curve point. Add / Move / Delete, snap, undo.
2. **Curve & tube** (middle): `x(t)`, `y(t)`, `z(t)` accept `t cos t`, `sin 3t`, `2pi`, `atan2(t,1)` ... The polygon is swept along the curve in a Bishop (rotation-minimizing) frame, computed by double reflection.
3. **Flat pieces** (right): each polygon edge sweeps a developable ruled strip (rulings a_i b_i; d' ∥ T under Bishop transport). Each strip is unfolded triangle by triangle, viewed from outside, and stacked. "flatness err" = mismatch of the unused diagonal (≈0 where the tube is smooth; large where the tube folds through the curve's centre of curvature).

State autosaves to localStorage; Save/Load (browser) and Download/Open `.json`. Export SVG / DXF (R12) / EPS.

## Joints, splitting, rearranging
- **Joint tab** (left panel): draw one dovetail cell in the seam's frame (x along the seam, y across). Above the line = tab of the piece owning the seam's B rail, below = socket. Ends are fixed. Cell width and end margin are set in the bar; the cell is repeated (re-fitted to the seam length, depth scaled with it) along every seam and every cut, so mating boundaries are the same curve and fit.
- **Flat panel tools:** Move (drag a piece, `[` / `]` or the rotate buttons turn the selected piece, shift = 45°), Split (click a piece: cut across at the nearest ruling, with the joint along the cut), Join (click a cut to merge). Re-stack resets placements.
- Code: `js/joints.js` (profile layout, boundary construction, splitting, placement), `js/jointedit.js` (profile editor). Seams are cut into independent segments at every split of either neighbouring edge, so mates always agree.
