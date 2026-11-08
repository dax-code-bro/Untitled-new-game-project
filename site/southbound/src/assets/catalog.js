// Vehicle catalog: 93 land vehicles, plus the tuning parts that fit them.
// Every model derives its body from one of the base body specs in
// carbuilder.js with its own proportions, wheels, lights and handling, so
// each one is a distinct shape on the road. All makes and models are invented.
import { deriveSpec, registerSpec } from './carbuilder.js';
import { VEHICLES } from './library.js';

const MAKES = ['Vantor', 'Meridian', 'Brazos', 'Calvera Motors', 'Gulfstar', 'Rivet', 'Sabine', 'Corsair', 'Lone Star Works', 'Heron', 'Delta Auto', 'Pelican', 'Ironbridge', 'Mesa', 'Bayline'];

// [class label, base body, count, ranges for L/W/height scale, handling, price, extra spec tweaks]
const CLASSES = [
  ['Compact', 'hatchback-sports', 8, { L: [3.7, 4.2], W: [1.7, 1.8], hk: [0.97, 1.05] }, { accel: 8.5, top: 46, grip: 7.6 }, 16000, { spokes: [5, 6, 10], fender: 0.1 }],
  ['Sedan', 'sedan', 12, { L: [4.5, 5.0], W: [1.78, 1.9], hk: [0.96, 1.04] }, { accel: 9, top: 50, grip: 7.5 }, 26000, { spokes: [6, 10, 0] }],
  ['Wagon', 'sedan', 5, { L: [4.7, 5.0], W: [1.8, 1.88], hk: [1.0, 1.05] }, { accel: 8.5, top: 48, grip: 7.3 }, 30000, { wagon: true, spokes: [6, 10] }],
  ['Coupe', 'sedan-sports', 7, { L: [4.4, 4.7], W: [1.82, 1.92], hk: [1.03, 1.1] }, { accel: 11, top: 60, grip: 8.4 }, 42000, { spokes: [5, 10], fender: 0.14 }],
  ['Muscle', 'sedan', 7, { L: [4.8, 5.2], W: [1.9, 2.0], hk: [0.9, 0.95] }, { accel: 12.5, top: 64, grip: 7.2 }, 48000, { muscle: true, spokes: [5, 6], fender: 0.16 }],
  ['Sports', 'sedan-sports', 8, { L: [4.3, 4.6], W: [1.88, 1.96], hk: [0.96, 1.0] }, { accel: 13, top: 72, grip: 9 }, 95000, { spokes: [5, 10], fender: 0.17 }],
  ['Super', 'sedan-sports', 6, { L: [4.4, 4.7], W: [1.95, 2.05], hk: [0.86, 0.92] }, { accel: 16, top: 88, grip: 10.5 }, 320000, { spokes: [5, 10], fender: 0.2 }],
  ['SUV', 'suv', 10, { L: [4.4, 5.2], W: [1.85, 2.05], hk: [0.95, 1.06] }, { accel: 8.5, top: 48, grip: 6.8 }, 38000, { spokes: [6, 10, 5] }],
  ['Pickup', 'truck', 8, { L: [5.2, 5.9], W: [1.95, 2.08], hk: [0.96, 1.05] }, { accel: 8.5, top: 47, grip: 6.4 }, 34000, { spokes: [6, 0], crew: true }],
  ['Van', 'van', 5, { L: [4.8, 5.4], W: [1.9, 2.0], hk: [0.95, 1.08] }, { accel: 7, top: 40, grip: 6 }, 29000, { spokes: [6, 0] }],
  ['Truck', 'delivery', 4, { L: [5.6, 7.0], W: [2.0, 2.2], hk: [0.95, 1.1] }, { accel: 6.2, top: 35, grip: 5.4 }, 52000, { spokes: [0] }],
  ['Bus', 'delivery', 2, { L: [10, 12], W: [2.5, 2.55], hk: [1.15, 1.2] }, { accel: 4.5, top: 30, grip: 4.6 }, 140000, { bus: true, spokes: [0] }],
  ['Emergency', null, 4, null, null, 0, null],
  ['Service', null, 4, null, null, 0, null],
  ['Off-road', 'suv', 3, { L: [3.6, 4.3], W: [1.75, 1.9], hk: [0.95, 1.05] }, { accel: 10, top: 46, grip: 8.2 }, 24000, { offroad: true, spokes: [6, 0] }],
];
// emergency/service vehicles reuse the dedicated body specs
const FIXED = {
  Emergency: [['police', 'Calvera PD Cruiser', 0], ['police-suv', 'Calvera PD Interceptor SUV', 0], ['ambulance', 'Mercy Ambulance', 0], ['firetruck', 'CFD Engine 9', 0]],
  Service: [['taxi', 'Calvera Cab', 18000], ['garbage-truck', 'City Sanitation', 90000], ['tow-truck', 'Gulfline Wrecker', 60000], ['delivery', 'Gulf Parcel Van', 45000]],
};
const NAMES = ['Arrow', 'Bandera', 'Corona', 'Durango', 'Esteban', 'Falcon', 'Galveston', 'Harbor', 'Ibis', 'Jubilee', 'Kestrel', 'Laredo', 'Mirage', 'Nomad', 'Osprey', 'Pecos', 'Quail', 'Ranger', 'Saber', 'Tejas', 'Ute', 'Vaquero', 'Wren', 'Xavier', 'Yucca', 'Zephyr', 'Atlas', 'Bravo', 'Cimarron', 'Dorado', 'Encino', 'Frontera'];


// ---- every model its own design (the owner: "most of them were just slightly different versions")
// One real-world body style per model. f: windscreen base/top (zA0/zA1), rear window top/base
// (zC1/zC0) and more, as fractions of half the length (+ toward the nose); set: heights in metres
// and other exact numbers; the rest are shape features drawn by carbuilder.js (soft = rounded vs
// boxy edges, bulge/scoop on the bonnet, waist = narrower at the doors, flare = wheel-arch flares,
// rack = roof rails (2 with crossbars), spare wheel, bull bar, running boards, roofMode 1 vinyl /
// 2 fabric top, chrome bumpers, split = two-tone line, factory spoiler).
const WHITE = [0.84, 0.83, 0.8], CREAM = [0.82, 0.76, 0.6], BLACKR = [0.02, 0.02, 0.022];
const HEAD = { rect: [0.62, 0.76, 0.18, 0.05], slim: [0.64, 0.74, 0.22, 0.028], round: [0.6, 0.74, 0.1, 0.085], tall: [0.66, 0.92, 0.13, 0.1], wide: [0.6, 0.8, 0.24, 0.06] };
const TAIL = { rect: [0.64, 0.86, 0.17, 0.06], bar: [0.45, 0.95, 0.42, 0.035], tall: [0.78, 1.0, 0.08, 0.18], wide: [0.58, 0.82, 0.3, 0.07], round: [0.6, 0.86, 0.08, 0.07] };
const DESIGNS = {
  Compact: [
    { L: [3.85, 3.95], f: { zA0: 0.4, zA1: 0.0, zC1: -0.78, zC0: -0.95 }, set: { nose: 0.7, hood: 0.93, belt: 0.98, roof: 1.56, deck: 0.98, tail: 0.98, tumble: 0.22 }, soft: 1.25, grilleH: 0.055, head: 'rect' },
    { L: [4.05, 4.15], W: [1.82, 1.85], f: { zA0: 0.34, zA1: -0.08, zC1: -0.72, zC0: -0.92 }, set: { nose: 0.62, hood: 0.86, belt: 0.9, roof: 1.38, deck: 0.92, tail: 0.92, ride: 0.11, tumble: 0.32 }, flare: 0.07, spoiler: 1, waist: 0.03, soft: 0.85, spokes: 5, head: 'slim' },
    { L: [3.95, 4.05], coupe: true, f: { zA0: 0.32, zA1: -0.1, zC1: -0.66, zC0: -0.95 }, set: { roof: 1.43, belt: 0.97 }, head: 'wide', tail: 'wide' },
    { L: [3.0, 3.2], W: [1.6, 1.65], coupe: true, f: { zA0: 0.5, zA1: 0.08, zC1: -0.86, zC0: -0.97, axF: 0.66, axR: -0.68 }, set: { nose: 0.66, hood: 0.86, belt: 0.96, roof: 1.6, deck: 0.96, tail: 0.98, Rw: 0.28, tumble: 0.18 }, soft: 1.6, spokes: 0, head: 'round', tail: 'round' },
    { L: [4.1, 4.2], f: { zA0: 0.36, zA1: -0.03, zC1: -0.8, zC0: -0.95 }, set: { ride: 0.22, Rw: 0.35, nose: 0.78, hood: 1.0, belt: 1.03, roof: 1.62, deck: 1.03, tail: 1.03 }, rack: 1, flare: 0.05, head: 'tall', tail: 'tall' },
    { L: [3.8, 3.9], f: { zA0: 0.36, zA1: 0.02, zC1: -0.62, zC0: -0.92 }, set: { nose: 0.7, hood: 0.88, belt: 0.93, roof: 1.48, deck: 0.93, tail: 0.9, tumble: 0.42 }, soft: 1.8, chrome: true, roofMode: 1, roofC: WHITE, head: 'round', tail: 'round' },
    { L: [4.0, 4.15], f: { zA0: 0.38, zA1: -0.05, zC1: -0.5, zC0: -1.0 }, set: { roof: 1.45, belt: 0.97, deck: 1.02, tail: 1.05 }, soft: 1.3, head: 'slim', tail: 'bar' },
    { base: 'sedan', L: [4.2, 4.35], f: { zA0: 0.3, zA1: -0.06, zC1: -0.48, zC0: -0.66 }, set: { roof: 1.44 }, soft: 1.05, head: 'rect' },
  ],
  Sedan: [
    { f: { zA0: 0.31, zA1: -0.05, zC1: -0.45, zC0: -0.71 }, soft: 1.2, head: 'rect' },
    { L: [5.15, 5.3], f: { zA0: 0.22, zA1: -0.14, zC1: -0.5, zC0: -0.7, axF: 0.64, axR: -0.6 }, set: { nose: 0.78, hood: 1.0, belt: 1.03, roof: 1.47, deck: 1.04, tail: 0.98, grille: 0.5 }, grilleH: 0.12, chrome: true, head: 'rect', tail: 'wide' },
    { f: { zA0: 0.27, zA1: -0.15, zC1: -0.42, zC0: -0.86 }, set: { roof: 1.36, belt: 0.93, deck: 0.93 }, waist: 0.03, soft: 1.1, head: 'slim', tail: 'bar' },
    { f: { zA0: 0.32, zA1: 0.02, zC1: -0.42, zC0: -0.62 }, set: { nose: 0.74, hood: 0.92, belt: 0.96, roof: 1.42, deck: 0.98, tail: 0.95, tumble: 0.12 }, soft: 0.45, grilleH: 0.05, head: 'wide', tail: 'wide', spokes: 0 },
    { f: { zA0: 0.33, zA1: -0.06, zC1: -0.48, zC0: -0.72 }, set: { roof: 1.42, tumble: 0.38 }, soft: 1.7, head: 'round' },
    { L: [4.3, 4.45], W: [1.72, 1.76], set: { roof: 1.5, belt: 1.0, tumble: 0.25 }, spokes: 0, head: 'rect' },
    { L: [6.3, 6.5], f: { zA0: 0.23, zA1: -0.03, zC1: -0.62, zC0: -0.75, axF: 0.66, axR: -0.67 }, set: { roof: 1.46, belt: 1.0, nose: 0.76 }, chrome: true, paint: [0.012, 0.012, 0.014, 0.3], head: 'rect', tail: 'wide' },
    { set: { ride: 0.12, roof: 1.38, belt: 0.93 }, flare: 0.03, spoiler: 1, waist: 0.02, spokes: 5, head: 'slim' },
    { f: { zA0: 0.42, zA1: 0.05, zC1: -0.5, zC0: -0.86 }, set: { roof: 1.46, deck: 1.0, tail: 1.02, tumble: 0.3 }, soft: 1.5, head: 'slim', tail: 'bar' },
    { L: [5.4, 5.55], W: [1.98, 2.0], f: { zA0: 0.2, zA1: -0.08, zC1: -0.4, zC0: -0.58 }, set: { nose: 0.74, hood: 0.86, belt: 0.92, roof: 1.38, deck: 0.9, tail: 0.86, tumble: 0.2 }, chrome: true, soft: 0.7, roofMode: 1, roofC: WHITE, head: 'round', tail: 'wide' },
    { L: [4.4, 4.55], f: { zA0: 0.33, zA1: -0.03, zC1: -0.42, zC0: -0.6 }, set: { roof: 1.45, deck: 1.02, grille: 0.28 }, head: 'tall' },
    { f: { zA0: 0.27, zA1: -0.12, zC1: -0.6, zC0: -0.8 }, set: { roof: 1.36 }, bulge: 0.02, chrome: true, soft: 0.8, head: 'round' },
  ],
  Wagon: [
    { wagon: true, rack: 1, soft: 1.2, head: 'rect', tail: 'tall' },
    { wagon: true, coupe: true, f: { zA0: 0.27, zA1: -0.15 }, set: { roof: 1.36, belt: 0.92 }, waist: 0.02, head: 'slim', tail: 'bar' },
    { wagon: true, set: { ride: 0.22, Rw: 0.36 }, flare: 0.04, rack: 2, head: 'tall', tail: 'tall' },
    { wagon: true, L: [5.6, 5.8], f: { glassBack: -0.3 }, set: { roof: 1.62, belt: 1.05 }, chrome: true, roofMode: 1, roofC: BLACKR, paint: [0.012, 0.012, 0.014, 0.3], head: 'rect' },
    { wagon: true, L: [4.95, 5.0], rack: 2, soft: 1.4, spokes: 6, head: 'round', tail: 'round' },
  ],
  Coupe: [
    { L: [4.65, 4.7], f: { zA0: 0.2, zA1: -0.2, zC1: -0.5, zC0: -0.85 }, set: { nose: 0.62, hood: 0.82, roof: 1.3 }, waist: 0.03, head: 'slim' },
    { base: 'sedan', coupe: true, f: { zA0: 0.3, zA1: -0.08, zC1: -0.38, zC0: -0.58 }, set: { roof: 1.37, belt: 0.94 }, chrome: true, roofMode: 1, roofC: BLACKR, head: 'round' },
    { L: [4.2, 4.3], f: { zA0: 0.3, zA1: -0.1, zC1: -0.5, zC0: -0.82 }, soft: 1.4, head: 'rect' },
    { f: { zA0: 0.22, zA1: -0.12, zC1: -0.42, zC0: -0.62 }, set: { roof: 1.24 }, roofMode: 2, roofC: BLACKR, head: 'round', tail: 'round' },
    { base: 'sedan', coupe: true, L: [5.15, 5.25], f: { zA0: 0.22, zA1: -0.1, zC1: -0.42, zC0: -0.6 }, set: { nose: 0.74, hood: 0.9, roof: 1.38, grille: 0.45 }, grilleH: 0.1, roofMode: 1, roofC: WHITE, chrome: true, head: 'rect', tail: 'wide' },
    { f: { zA0: 0.28, zA1: -0.14, zC1: -0.62, zC0: -0.95 }, set: { deck: 0.9, tail: 0.9 }, spoiler: 1, head: 'slim', tail: 'bar' },
    { f: { zA0: 0.25, zA1: -0.14, zC1: -0.42, zC0: -0.7 }, set: { nose: 0.55, hood: 0.78 }, soft: 0.8, roofMode: 1, roofC: BLACKR, head: 'wide' },
  ],
  Muscle: [
    { muscle: true, f: { zC1: -0.62, zC0: -0.86 }, bulge: 0.03, head: 'round' },
    { muscle: true, f: { zC1: -0.4, zC0: -0.6 }, roofMode: 1, roofC: BLACKR, chrome: true, head: 'round', tail: 'wide' },
    { muscle: true, scoop: true, spoiler: 2, head: 'rect' },
    { muscle: true, L: [5.15, 5.2], f: { zA0: 0.1, zA1: -0.2 }, scoop: true, flare: 0.03, head: 'round' },
    { muscle: true, set: { nose: 0.66, hood: 0.88, tail: 0.92 }, soft: 0.6, bulge: 0.02, head: 'wide', tail: 'wide' },
    { muscle: true, soft: 1.2, waist: 0.03, bulge: 0.025, spoiler: 1, head: 'slim', tail: 'bar' },
    { muscle: true, split: 0.72, paint2: WHITE, chrome: true, head: 'round', tail: 'rect' },
  ],
  Sports: [
    { f: { zA0: 0.38, zA1: -0.02, zC1: -0.3, zC0: -0.38, axF: 0.62, axR: -0.58 }, set: { nose: 0.55, hood: 0.72, deck: 0.98, tail: 0.95, roof: 1.18 }, waist: 0.04, flare: 0.03, spoiler: 2, head: 'slim' },
    { L: [4.0, 4.1], f: { zA0: 0.05, zA1: -0.25, zC1: -0.5, zC0: -0.62 }, set: { roof: 1.2 }, roofMode: 2, roofC: BLACKR, soft: 1.3, head: 'round' },
    { f: { zA0: 0.3, zA1: -0.15, zC1: -0.4, zC0: -0.75 }, set: { nose: 0.52, hood: 0.72, deck: 0.9, tail: 0.9, roof: 1.17 }, soft: 0.4, head: 'slim', tail: 'bar' },
    { f: { zA0: 0.12, zA1: -0.2, zC1: -0.5, zC0: -0.75 }, set: { roof: 1.24 }, soft: 2.0, fender: 0.24, waist: 0.05, chrome: true, head: 'round', tail: 'round' },
    { base: 'hatchback-sports', f: { zA0: 0.3, zA1: -0.08, zC1: -0.7, zC0: -0.92 }, set: { roof: 1.36, ride: 0.16, Rw: 0.34 }, flare: 0.08, spoiler: 2, head: 'rect' },
    { f: { zA0: 0.18, zA1: -0.2, zC1: -0.48, zC0: -0.8 }, roofMode: 1, roofC: BLACKR, waist: 0.03, head: 'wide' },
    { L: [4.55, 4.6], f: { zA0: 0.15, zA1: -0.22, zC1: -0.6, zC0: -0.9 }, bulge: 0.02, head: 'slim', tail: 'wide' },
    { set: { ride: 0.09, roof: 1.2 }, spoiler: 3, flare: 0.05, head: 'slim', tail: 'bar' },
  ],
  Super: [
    { f: { zA0: 0.45, zA1: 0.02, zC1: -0.25, zC0: -0.4 }, set: { nose: 0.5, hood: 0.68, deck: 0.95, tail: 0.92, roof: 1.12 }, soft: 0.5, spoiler: 2, head: 'slim', tail: 'bar' },
    { f: { zA0: 0.5, zA1: 0.08, zC1: -0.22, zC0: -0.42 }, set: { nose: 0.46, hood: 0.62, roof: 1.08, deck: 0.9 }, waist: 0.06, flare: 0.05, soft: 1.4, head: 'slim' },
    { f: { zA0: 0.05, zA1: -0.28, zC1: -0.55, zC0: -0.85 }, set: { nose: 0.58, hood: 0.78, roof: 1.22 }, bulge: 0.03, waist: 0.04, head: 'slim', tail: 'wide' },
    { f: { zA0: 0.42, zA1: 0.0, zC1: -0.3, zC0: -0.45 }, spoiler: 3, flare: 0.07, head: 'wide', tail: 'bar' },
    { f: { zA0: 0.4, zA1: 0.0, zC1: -0.28, zC0: -0.42 }, roofMode: 1, roofC: BLACKR, head: 'slim' },
    { f: { zA0: 0.4, zA1: 0.02, zC1: -0.3, zC0: -0.45 }, soft: 2.0, fender: 0.25, waist: 0.05, chrome: true, head: 'round', tail: 'round' },
  ],
  SUV: [
    { soft: 0.45, set: { tumble: 0.08 }, rack: 2, steps: true, spare: true, blunt: true, head: 'rect', tail: 'tall', spokes: 6 },
    { f: { zA0: 0.36, zA1: -0.02, zC1: -0.82, zC0: -0.95 }, set: { ride: 0.19, roof: 1.62, belt: 1.08, nose: 0.82, hood: 1.02, deck: 1.08, tail: 1.04, tumble: 0.25 }, soft: 1.3, flare: 0.03, head: 'slim' },
    { L: [5.55, 5.65], W: [2.06, 2.08], set: { roof: 1.95, belt: 1.28, nose: 1.0, hood: 1.22, tail: 1.22, deck: 1.28, grille: 0.55 }, grilleH: 0.15, chrome: true, steps: true, head: 'tall' },
    { L: [4.3, 4.4], set: { roof: 1.68 }, soft: 1.2, rack: 1, head: 'round' },
    { f: { zC1: -0.62, zC0: -0.92 }, set: { roof: 1.66, tail: 1.1, deck: 1.12 }, waist: 0.03, head: 'slim', tail: 'bar' },
    { L: [5.1, 5.2], set: { roof: 1.8, grille: 0.5 }, grilleH: 0.13, chrome: true, head: 'wide' },
    { L: [4.4, 4.5], soft: 0.35, set: { tumble: 0.05 }, bullbar: true, spare: true, flare: 0.06, rack: 2, blunt: true, head: 'round', spokes: 0 },
    { L: [5.2, 5.3], f: { zA0: 0.38, zC1: -0.93 }, rack: 1, head: 'rect' },
    { L: [3.9, 4.0], W: [1.75, 1.8], set: { roof: 1.75 }, soft: 1.0, spare: true, head: 'round' },
    { soft: 0.5, set: { tumble: 0.03 }, steps: true, spokes: 0, blunt: true, head: 'rect', tail: 'tall' },
  ],
  Pickup: [
    { L: [5.7, 5.8], blunt: true, head: 'rect' },
    { L: [5.6, 5.7], ext: 0.38, blunt: true, head: 'tall' },
    { L: [5.6, 5.7], crew: true, blunt: true, head: 'rect', steps: true },
    { L: [4.95, 5.05], W: [1.84, 1.86], set: { roof: 1.72, belt: 1.12, nose: 0.9, hood: 1.08 }, soft: 1.1, head: 'slim' },
    { L: [6.1, 6.2], W: [2.08, 2.1], crew: true, set: { roof: 2.02, belt: 1.32, nose: 1.12, hood: 1.3, grille: 0.6 }, grilleH: 0.16, steps: true, chrome: true, blunt: true, head: 'tall' },
    { L: [5.5, 5.6], set: { ride: 0.36, Rw: 0.44 }, flare: 0.07, bullbar: true, rack: 2, blunt: true, head: 'round' },
    { L: [5.4, 5.5], soft: 0.8, chrome: true, split: 0.75, paint2: CREAM, spokes: 0, head: 'round' },
    { L: [5.8, 5.9], flatbed: true, steps: true, spokes: 0, blunt: true, head: 'rect' },
  ],
  Van: [
    { L: [5.05, 5.1], f: { zA0: 0.55, zA1: 0.1, zC1: -0.92, zC0: -0.97 }, set: { nose: 0.74, hood: 0.95, belt: 1.02, roof: 1.78 }, soft: 1.4, rack: 1, head: 'slim' },
    { f: { glassBack: 0.15 }, set: { roof: 2.0 }, head: 'rect', spokes: 0 },
    { L: [5.55, 5.6], f: { glassBack: 0.15 }, set: { roof: 2.45 }, head: 'tall', spokes: 0 },
    { L: [5.35, 5.4], set: { roof: 2.05 }, rack: 2, head: 'rect' },
    { L: [5.15, 5.2], set: { roof: 2.1 }, split: 0.78, paint2: CREAM, rack: 2, spare: true, head: 'round', spokes: 0 },
  ],
  Truck: [
    { L: [6.4, 6.5], head: 'rect' },
    { L: [6.0, 6.1], f: { zA0: 0.92, zA1: 0.86 }, set: { nose: 1.0, hood: 1.25 }, soft: 0.4, head: 'round' },
    { base: 'truck', L: [6.6, 6.7], W: [2.18, 2.2], flatbed: true, set: { roof: 2.1, belt: 1.4, nose: 1.15, hood: 1.35 }, steps: true, blunt: true, head: 'tall', spokes: 0 },
    { L: [5.7, 5.8], split: 1.6, paint2: CREAM, rack: 2, head: 'round' },
  ],
  Bus: [
    { bus: true, head: 'rect' },
    { bus: true, busHood: true, paint: [0.78, 0.52, 0.02, 0.0], chrome: true, head: 'round' },
  ],
  'Off-road': [
    { L: [3.8, 3.85], roofMode: 2, roofC: BLACKR, spare: true, flare: 0.07, soft: 0.3, bullbar: true, blunt: true, head: 'round', spokes: 0 },
    { L: [4.2, 4.25], set: { ride: 0.36, Rw: 0.42 }, rack: 2, flare: 0.06, spare: true, head: 'rect' },
    { L: [4.5, 4.55], rack: 2, bullbar: true, steps: true, spare: true, set: { roof: 1.95 }, blunt: true, head: 'round' },
  ],
};

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const lerp = (a, b, t) => a + (b - a) * t;

export const LAND = []; // { id, cls, name, price, base }
export const CLASS_LIST = CLASSES.map((c) => c[0]);
{
  const r = rng(93);
  let n = 0;
  // extra base bodies: police SUV and tow truck
  registerSpec('police-suv', { ...deriveSpec('suv', { L: 5.05, W: 2.0 }), bar: 'siren', livery: 1, spokes: 0 });
  registerSpec('tow-truck', { ...deriveSpec('truck', { L: 5.9, W: 2.05, blunt: true }), tow: true, spokes: 0 });
  VEHICLES['police-suv'] = { name: 'Calvera PD Interceptor SUV', len: 5.05, accel: 12, top: 60, grip: 7.8, weight: 0 };
  VEHICLES['tow-truck'] = { name: 'Gulfline Wrecker', len: 5.9, accel: 7.5, top: 42, grip: 6, weight: 0 };
  VEHICLES.concept = { name: 'Gulfstar Concept', len: 4.45, accel: 15, top: 82, grip: 10, weight: 0 };
  for (const [cls, base, count, dims, hand, price, tw] of CLASSES) {
    if (!base) {
      for (const [id, name, pr] of FIXED[cls]) { LAND.push({ id, cls, name, price: pr || 25000, base: id, restricted: pr === 0 }); n++; }
      continue;
    }
    for (let i = 0; i < count; i++) {
      const t = count > 1 ? i / (count - 1) : 0.5;
      const d = DESIGNS[cls]?.[i] || {};
      const pick = (a, b) => lerp(a[0], a[1], b);
      const L = d.L ? pick(d.L, r()) : lerp(dims.L[0], dims.L[1], (t + r() * 0.3) % 1), W = d.W ? pick(d.W, r()) : lerp(dims.W[0], dims.W[1], r()), hk = lerp(dims.hk[0], dims.hk[1], r());
      const o = { L, W, hk, spokes: d.spokes ?? tw.spokes[i % tw.spokes.length], fender: d.fender ?? tw.fender, rake: d.f ? 0 : (r() - 0.5) * 0.25, fast: d.f ? 0 : (r() - 0.5) * 0.3, Rw: undefined };
      if (tw.wagon || d.wagon) o.wagon = true;
      if (tw.muscle || d.muscle) o.muscle = true;
      if (tw.bus || d.bus) o.bus = true;
      if (tw.offroad) o.offroad = true;
      if (d.crew || (tw.crew && !DESIGNS[cls] && i % 2 === 0)) o.crew = true;
      // the design's own shape (carbuilder.js deriveSpec)
      for (const k of ['f', 'set', 'soft', 'bulge', 'scoop', 'waist', 'flare', 'rack', 'spare', 'bullbar', 'steps', 'roofMode', 'roofC', 'chrome', 'split', 'paint', 'paint2', 'grilleH', 'spoiler', 'coupe', 'flatbed', 'ext', 'busHood', 'blunt'])
        if (d[k] !== undefined) o[k] = d[k];
      if (d.set?.Rw) o.Rw = d.set.Rw;
      const id = `${cls.toLowerCase().replace(/[^a-z]/g, '')}_${String(i + 1).padStart(2, '0')}`;
      const spec = deriveSpec(d.base || base, o);
      // lamps: the design's style, sized to this body
      if (d.head && HEAD[d.head]) { const h = HEAD[d.head]; spec.head = [Math.min(W / 2 - h[2] - 0.05, h[0] * W / 1.84), h[1] * (spec.hood / 0.95), h[2], h[3]]; }
      if (d.tail && TAIL[d.tail]) { const h = TAIL[d.tail]; spec.tail4 = [Math.min(W / 2 - h[2] - 0.04, h[0] * W / 1.84), Math.min(h[1] * (spec.deck / 1.0), spec.belt - h[3] - 0.02), h[2], h[3]]; }
      registerSpec(id, spec);
      const make = MAKES[Math.floor(r() * MAKES.length)], model = NAMES[(n * 7 + i * 3) % NAMES.length];
      const name = `${make} ${model}${cls === 'Super' ? ' ' + ['R', 'GT', 'RS', 'Evo', 'S', 'X'][i % 6] : ''}`;
      const k = 1 + (r() - 0.5) * 0.2;
      // on the road too (they had weight 0: traffic only ever drew the 13 base bodies)
      const weight = { Compact: 1, Sedan: 1.1, Wagon: 0.6, Coupe: 0.5, Muscle: 0.35, Sports: 0.22, Super: 0.05, SUV: 1.1, Pickup: 1, Van: 0.6, Truck: 0.35, Bus: 0, 'Off-road': 0.35 }[cls] ?? 0;
      VEHICLES[id] = { name, len: L, accel: +(hand.accel * k).toFixed(2), top: Math.round(hand.top * k), grip: +(hand.grip * (1 + (r() - 0.5) * 0.12)).toFixed(2), weight };
      LAND.push({ id, cls, name, price: Math.round(price * k * (1 + t * 0.4) / 500) * 500, base });
      n++;
    }
  }
}

// realistic open-source model (Khronos glTF sample 'CarConcept', CC-BY 4.0), PC presets
LAND.push({ id: 'concept', cls: 'Super', name: 'Gulfstar Concept (photoreal)', price: 450000, base: 'concept' });

// --- tuning: 63 parts per car (48 performance + 15 looks) -------------------
// effect keys: accel, top, grip, brake, armor (extra health), ride (lowering, m), nitro
const PERF = [
  ['Engine', 5, { accel: 0.07, top: 0.03 }, 2500],
  ['Turbo', 3, { accel: 0.08 }, 6000],
  ['Transmission', 4, { accel: 0.04, top: 0.02 }, 2000],
  ['Brakes', 4, { brake: 0.12 }, 1200],
  ['Suspension', 4, { grip: 0.04, ride: -0.02 }, 1500],
  ['Tires', 4, { grip: 0.06 }, 900],
  ['Armor', 5, { armor: 30 }, 3000],
  ['Nitrous', 3, { nitro: 1 }, 5000],
  ['Weight reduction', 3, { accel: 0.04, grip: 0.02 }, 3500],
  ['ECU tune', 3, { accel: 0.03, top: 0.03 }, 1800],
  ['Exhaust', 4, { accel: 0.02 }, 800],
  ['Intake', 3, { accel: 0.02, top: 0.01 }, 700],
  ['Differential', 3, { grip: 0.03 }, 1600],
];
const LOOKS = [
  ['Rims: 5-spoke', { spokes: 5 }, 1200], ['Rims: 6-spoke', { spokes: 6 }, 1100], ['Rims: 10-spoke', { spokes: 10 }, 1400], ['Rims: steel', { spokes: 0 }, 300], ['Rims: mesh', { spokes: 14 }, 2200],
  ['Window tint: light', { tint: 0.4 }, 400], ['Window tint: dark', { tint: 0.75 }, 600], ['Window tint: limo', { tint: 1 }, 900],
  ['Spoiler: lip', { spoiler: 1 }, 700], ['Spoiler: wing', { spoiler: 2 }, 1600], ['Spoiler: GT wing', { spoiler: 3 }, 2800],
  ['Lights: xenon', { lights: 1.6 }, 800], ['Lights: LED', { lights: 2.2 }, 1200],
  ['Plates: Calvera classic', { plate: 1 }, 150], ['Plates: vanity', { plate: 2 }, 900],
];
export const UPGRADES = [];
for (const [name, tiers, fx, price] of PERF) {
  for (let t = 1; t <= tiers; t++) UPGRADES.push({ id: `${name.toLowerCase().replace(/[^a-z]/g, '')}_${t}`, group: name, name: `${name} ${['', 'Stage 1', 'Stage 2', 'Stage 3', 'Stage 4', 'Stage 5'][t]}`, tier: t, fx, price: Math.round(price * t * (1 + t * 0.25)), kind: 'perf' });
}
for (const [name, fx, price] of LOOKS) UPGRADES.push({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), group: name.split(':')[0], name, tier: 1, fx, price, kind: 'look' });

// Paint shop colours (sold separately, not counted as parts)
export const PAINTS = [
  ['Arctic White', [0.82, 0.82, 0.8], 0], ['Pearl White', [0.8, 0.78, 0.72], 0.6], ['Gloss Black', [0.012, 0.012, 0.014], 0.2], ['Midnight Blue', [0.01, 0.025, 0.09], 0.7],
  ['Gulf Blue', [0.05, 0.2, 0.45], 0.5], ['Racing Red', [0.45, 0.01, 0.01], 0.2], ['Candy Red', [0.32, 0.005, 0.01], 0.9], ['Sunset Orange', [0.6, 0.18, 0.02], 0.5],
  ['Taxi Yellow', [0.62, 0.42, 0.02], 0], ['Lime', [0.25, 0.5, 0.03], 0.4], ['Bayou Green', [0.03, 0.12, 0.05], 0.6], ['Gunmetal', [0.1, 0.105, 0.11], 0.9],
  ['Silver', [0.45, 0.46, 0.48], 1], ['Champagne', [0.42, 0.34, 0.22], 0.9], ['Desert Tan', [0.36, 0.28, 0.17], 0.2], ['Purple Haze', [0.12, 0.03, 0.2], 0.8],
  ['Hot Pink', [0.6, 0.06, 0.2], 0.4], ['Chrome', [0.75, 0.75, 0.77], 1], ['Matte Black', [0.02, 0.02, 0.02], 0], ['Matte Army', [0.08, 0.1, 0.06], 0],
];

// Apply owned upgrades to a spawned Vehicle (handling + looks)
export function applyUpgrades(v, up = {}) {
  const base = v.baseSpec || (v.baseSpec = { ...v.spec });
  const s = v.spec;
  s.accel = base.accel; s.top = base.top; s.grip = base.grip; s.brakeK = 1;
  let armor = 0, ride = 0;
  for (const [group, tier] of Object.entries(up)) {
    const fam = PERF.find((p) => p[0] === group);
    if (!fam) continue;
    const fx = fam[2];
    s.accel *= 1 + (fx.accel || 0) * tier; s.top *= 1 + (fx.top || 0) * tier; s.grip *= 1 + (fx.grip || 0) * tier;
    s.brakeK *= 1 + (fx.brake || 0) * tier; armor += (fx.armor || 0) * tier; ride += (fx.ride || 0) * tier;
    if (fx.nitro) v.nitro = tier;
  }
  v.maxHealth = 100 + armor;
  v.health = Math.min(v.health, v.maxHealth);
  v.body.position.y = ride;
  const u = v.bodyMat?.userData.u;
  if (u) {
    if (up.tint !== undefined) u.uTint.value = up.tint;
    if (up.lights !== undefined) u.uLightK.value = up.lights;
    if (up.paint) { u.uPaint.value.setRGB(up.paint[0], up.paint[1], up.paint[2]); u.uMetal.value = up.paint[3]; }
  }
  if (up.spokes !== undefined && v.setRims) v.setRims(up.spokes);
  if (v.setSpoiler) v.setSpoiler(up.spoiler ?? v.procSpec?.spoiler ?? 0);
}
