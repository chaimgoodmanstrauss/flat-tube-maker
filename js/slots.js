// Slotting / dovetail component - NOT IMPLEMENTED YET. Hook point for the next stage.
//
// Contract: FTM.slots.apply(pieces, ctx) runs after unfolding and layout, before drawing/export.
// It may replace or extend piece.paths (array of {layer, closed, pts:[[x,y]...]}), e.g.
//   - replace the 'CUT' outline with one that has dovetail tabs on a seam rail,
//   - add 'SCORE' / 'ENGRAVE' layers (any layer other than 'CUT' is drawn as a secondary colour and exported on its own layer).
//
// What each piece offers for this:
//   piece.rails.A / piece.rails.B   unfolded seam polylines in the plane (index i <-> curve sample i; A[i]B[i] is a ruling)
//   piece.seams[0|1]                {rail:'A'|'B', vertex, mate}: seam id = polygon vertex index; `mate` = piece id sharing that seam (null at an open-polygon boundary)
//   piece.length.A / .B             3D arclength of each rail; the mate's matching rail has the same length and parameterisation,
//                                   so tab/slot positions chosen by arclength s on one side land on the other
//   piece.flatErr                   max relative error of the unused diagonal (flatness check)
//   ctx.frames {U,V,T}, ctx.curve   Bishop frame and curve samples, in case a joint depends on the 3D dihedral angle at the seam
//                                   (dihedral angle between adjacent faces at vertex k is available from the polygon: turning angle there)
// The seam rail of piece j (rail B) and the seam rail of piece j+1 (rail A) are mirror images when laid flat; a dovetail
// pair must therefore be generated as complementary tab/slot profiles along the same arclength parameter.
window.FTM = window.FTM || {};
FTM.slots = {
  params: { enabled: false },
  apply(pieces /*, ctx */) { return pieces; },
};
