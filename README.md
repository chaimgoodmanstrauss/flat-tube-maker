# Flat Tube Maker

Open `index.html` (no build, no dependencies).

1. **Cross-section** (left): closed polygon in the (U,V) plane of the sweep frame; fixed origin = the curve point. Add / Move / Delete, Rotate / Homothety / Scale, Regular / Star / Segment, undo.
2. **Curve & tube** (middle): `x(t)`, `y(t)`, `z(t)` accept `t cos t`, `sin 3t`, `2pi`, `atan2(t,1)` ... The polygon is swept along the curve in a Bishop (rotation-minimizing) frame, computed by double reflection. "teeth" shows the teeth on the tube.
3. **Flat pieces** (right): one developable strip per polygon edge, laid flat, seen from outside.

State autosaves to localStorage; Save/Load (browser) and Download/Open `.json`. Export SVG / DXF (R12) / EPS: cut paths are joined and their corners rounded very slightly (0.2 mm).

## Strip coordinates
Strip i (polygon edge from vertex i to i+1, polygon taken counter-clockwise, width w_i) has coordinates (s, t):
s = arclength along the centre curve (the same for every strip), t = signed distance along the ruling from the edge's
midpoint, -w_i/2 at vertex i+1, +w_i/2 at vertex i. Then S_i(s,-w_i/2) = S_(i+1)(s,+w_(i+1)/2), and n = ds x dt points
outward. Rulings are straight in space and in the flat, with t true length along them; lengths in s are stretched by
1 - (curvature toward that point) x (distance from the curve). Code: `FTM.buildStrips`, `FTM.spacePt`, `FTM.flatPt` (`js/geom.js`).

## Teeth, splitting, rearranging
- **Tooth tab** (left panel): tooth (x, y), |x| <= tw/2, y >= 0; x is stored as a fraction of the tooth width tw, so
  dragging the dashed cell sides rescales the tooth horizontally only. Glide / Rotate chooses the map to the other edge:
  - + edge: tooth(x,y) -> S_i(x + k tw, w_i/2 + y)
  - - edge: tooth(x,y) -> S_i(+-x + (k+1/2) tw, -w_i/2 - y)
  The pane shows a preview strip of depth D (drag its lower edge) with both rows of teeth filled in.
- Only whole cells inside a piece get teeth: none across the strip ends or across a split.
- **Flat panel tools:** Move (drag a piece, `[` / `]` turn the selected piece, shift = 45 deg), Split (click a piece: cut
  across at the nearest s = multiple of tw/2, with a plain overlap flap and a mark where it ends), Reset splits, Re-stack.
- Code: `js/teeth.js` (tooth map, piece outlines, splitting, placement), `js/toothedit.js` (tooth editor).
