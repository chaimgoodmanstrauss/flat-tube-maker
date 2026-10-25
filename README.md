# Flat Tube Maker

Open `index.html` (no build, no dependencies).

1. **Cross-section** (left): closed/open polygon in the (U,V) plane of the sweep frame; fixed origin = the curve point. Add / Move / Delete, snap, undo.
2. **Curve & tube** (middle): `x(t)`, `y(t)`, `z(t)` accept `t cos t`, `sin 3t`, `2pi`, `atan2(t,1)` ... The polygon is swept along the curve in a Bishop (rotation-minimizing) frame, computed by double reflection.
3. **Flat pieces** (right): each polygon edge sweeps a developable ruled strip (rulings a_i b_i; d' ∥ T under Bishop transport). Each strip is unfolded triangle by triangle, viewed from outside, and stacked. "flatness err" = mismatch of the unused diagonal (≈0 where the tube is smooth; large where the tube folds through the curve's centre of curvature).

State autosaves to localStorage; Save/Load (browser) and Download/Open `.json`. Export SVG / DXF (R12) / EPS.

## Joints, splitting, rearranging
- **Joint tab** (left panel): draw one dovetail cell in the seam's frame (x along the seam, y across). Paper is below the line, up = outward from the piece. The cell is translated along every piece edge (seams and cuts), re-fitted to the edge length; on the opposite edge of a strip "outward" is the reverse direction, so the cell is applied rotated by 180° there. Draw a cell that is symmetric under a 180° rotation (a tab plus a matching socket, the default) and the two pieces on a seam interlock.
- **Flat panel tools:** Move (drag a piece, `[` / `]` or the rotate buttons turn the selected piece, shift = 45°), Split (click a piece: cut across at the nearest ruling, with the joint along the cut), Join (click a cut to merge). Re-stack resets placements.
- Code: `js/joints.js` (profile layout, boundary construction, splitting, placement), `js/jointedit.js` (profile editor). Seams are cut into independent segments at every split of either neighbouring edge, so mates always agree.
