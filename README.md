# Flat Tube Maker

Open `index.html` (no build, no dependencies).

1. **Cross-section** (left): closed/open polygon in the (U,V) plane of the sweep frame; fixed origin = the curve point. Add / Move / Delete, snap, undo.
2. **Curve & tube** (middle): `x(t)`, `y(t)`, `z(t)` accept `t cos t`, `sin 3t`, `2pi`, `atan2(t,1)` ... The polygon is swept along the curve in a Bishop (rotation-minimizing) frame, computed by double reflection.
3. **Flat pieces** (right): each polygon edge sweeps a developable ruled strip (rulings a_i b_i; d' ∥ T under Bishop transport). Each strip is unfolded triangle by triangle, viewed from outside, and stacked. "flatness err" = mismatch of the unused diagonal (≈0 where the tube is smooth; large where the tube folds through the curve's centre of curvature).

State autosaves to localStorage; Save/Load (browser) and Download/Open `.json`. Export SVG / DXF (R12) / EPS.

## Next: slotting
`js/slots.js` is the hook (`FTM.slots.apply(pieces, ctx)`); its header documents the per-piece seam data (rails, seam ids, mates, arclengths) a dovetail generator needs. Pieces carry `paths[]` with layers (`CUT` plus any extra layer, exported as separate layers).
