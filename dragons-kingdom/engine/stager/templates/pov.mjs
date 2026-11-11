// pov (1C-08, X5-17, X4-15): the camera at the eye (actor.head + 8 cm), aimed at what it sees; the eye's owner hidden
// (its mount flies on); dragonback shake when riding. Replaces the ground v1 fallback (W_POV_V1).
export const name = 'pov';
export const params = (I) => ({ kind: 'pov', mm: I.mm || 35, fstop: 5.6, dist: 30, rise: 0, rel: 0 });
