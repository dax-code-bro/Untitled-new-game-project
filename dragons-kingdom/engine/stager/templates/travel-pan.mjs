// travel-pan: a pan round the set (X5-03): a follow rig drifting 4-8 m, look keys through the named landmarks in
// compass order, at most 30 deg/s (flagged above that).
export const name = 'travel-pan';
export const params = (I, B) => ({ rig: 'follow', mm: I.mm || 35, fstop: 8, from: B.pref, dist: 0, height: B.groundY + 1.75, pan: true });
