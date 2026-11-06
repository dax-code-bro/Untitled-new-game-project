// Clothes. 13,500 pieces: every style comes in a set of patterns and 50
// colours (eyewear: 4 lens tints and 25 frame colours).
//
// John's body has one cloth mesh (long sleeves, long trousers). A shader cuts it
// into a top, a jacket over it, trousers or shorts and bare skin, using where a
// vertex sits on the body in its bind pose and whether it belongs to the arm:
// sleeve length, shirt hem (tucked or not), open jacket fronts, overall bibs,
// belts, pockets, buttons, cuffs, then the pattern (stripes, plaid, camo,
// denim wash...) and the weave (twill, knit, waffle, quilting, leather grain).
// Jackets are pushed out a few millimetres so they sit over the shirt. Shoes and
// gloves are recoloured on their own meshes; hats, glasses and neckwear are
// small models riding the head and neck bones.
import * as THREE from 'three';

export const COLORS = [
  ['Black', 0x161616], ['Charcoal', 0x33343a], ['Slate grey', 0x5d636b], ['Heather grey', 0x9a9b9e], ['Silver', 0xc4c6c8],
  ['White', 0xf1f0ec], ['Cream', 0xe8dcc2], ['Khaki', 0xc3ae86], ['Tan', 0xb08d62], ['Camel', 0xa87a48],
  ['Brown', 0x6b4528], ['Chocolate', 0x45291a], ['Rust', 0x9a4a22], ['Brick red', 0x8e2f25], ['Red', 0xb3241f],
  ['Cherry', 0x8a1424], ['Burgundy', 0x5c1a24], ['Pink', 0xe5a1b0], ['Hot pink', 0xd2467a], ['Coral', 0xe9765f],
  ['Orange', 0xdf6a1f], ['Blaze orange', 0xff5a10], ['Mustard', 0xc9a033], ['Yellow', 0xe8cf3a], ['Lemon', 0xf1e58a],
  ['Olive', 0x6b6a35], ['Army green', 0x4b5530], ['Forest green', 0x24452c], ['Kelly green', 0x2f8a46], ['Mint', 0x9fd6b6],
  ['Teal', 0x1f6e6e], ['Turquoise', 0x3fb3b0], ['Sky blue', 0x8cbfe0], ['Light blue', 0xb6cfe6], ['Denim blue', 0x48678c],
  ['Royal blue', 0x2a4fa8], ['Navy', 0x1d2a44], ['Indigo', 0x2c2f5a], ['Purple', 0x5a3478], ['Lavender', 0xab97c9],
  ['Plum', 0x5a2d4a], ['Sand', 0xd7c49e], ['Stone', 0xa79f8f], ['Mud', 0x5e5140], ['Moss', 0x5d6b3a],
  ['Gulf blue', 0x2f6f9a], ['Sunset', 0xe88b4a], ['Oxblood', 0x4a1414], ['Bone', 0xddd3bd], ['Gunmetal', 0x3d4248],
];
export const FRAME_COLORS = [
  ['Black', 0x111111], ['Matte black', 0x262626], ['Tortoise', 0x5a3a1e], ['Honey tortoise', 0x9a6a2e], ['Gold', 0xc9a640],
  ['Rose gold', 0xc98f78], ['Silver', 0xbfc3c7], ['Gunmetal', 0x3d4248], ['Bronze', 0x7a5a32], ['Crystal', 0xd8dde0],
  ['White', 0xeeeeea], ['Red', 0xa8221c], ['Burgundy', 0x5c1a24], ['Navy', 0x1d2a44], ['Royal blue', 0x2a4fa8],
  ['Teal', 0x1f6e6e], ['Olive', 0x6b6a35], ['Forest green', 0x24452c], ['Brown', 0x6b4528], ['Tan', 0xb08d62],
  ['Pink', 0xe5a1b0], ['Orange', 0xdf6a1f], ['Yellow', 0xe8cf3a], ['Purple', 0x5a3478], ['Clear grey', 0x9a9b9e],
];

// pattern ids used by the shader
const PAT = { Solid: 0, Striped: 1, Plaid: 2, Camo: 3, Faded: 4, 'Two-tone': 5, 'Denim wash': 6, Pinstripe: 7, Plain: 0, Patterned: 2 };
// weave ids: 0 plain, 1 twill, 2 knit, 3 waffle, 4 quilted, 5 leather
export const SLOTS = [
  { k: 'top', label: 'Tops', patterns: ['Solid', 'Striped', 'Plaid', 'Camo', 'Faded', 'Two-tone'], styles: [
    { id: 'tee', name: 'T-shirt', price: 18, sleeve: 0.3, hem: 0.06, collar: 0, desc: 'Heavyweight cotton crew neck.' },
    { id: 'vneck', name: 'V-neck tee', price: 20, sleeve: 0.3, hem: 0.06, collar: 1, desc: 'Soft jersey with a V neck.' },
    { id: 'longtee', name: 'Long-sleeve tee', price: 24, sleeve: 1.2, hem: 0.06, collar: 0, desc: 'For mornings on the water.' },
    { id: 'henley', name: 'Henley', price: 32, sleeve: 1.2, hem: 0.06, collar: 4, desc: 'Three-button placket, long sleeves.' },
    { id: 'tank', name: 'Tank top', price: 14, sleeve: -0.3, hem: 0.06, collar: 0, desc: 'Gulf summer. Bare shoulders.' },
    { id: 'polo', name: 'Polo shirt', price: 36, sleeve: 0.32, hem: 0.1, collar: 3, desc: 'Pique knit with a two-button placket.' },
    { id: 'work', name: 'Work shirt', price: 38, sleeve: 0.55, hem: 0.16, collar: 2, pockets: 2, weave: 1, desc: 'Twill, two flap pockets, sleeves rolled to the elbow. Tucked in.' },
    { id: 'flannel', name: 'Flannel shirt', price: 42, sleeve: 1.2, hem: 0.04, collar: 2, pockets: 2, desc: 'Brushed cotton, worn open at the waist.' },
    { id: 'western', name: 'Western shirt', price: 58, sleeve: 1.2, hem: 0.16, collar: 2, pockets: 2, yoke: 1, desc: 'Pearl snaps and a pointed yoke. Tucked in.' },
    { id: 'dress', name: 'Dress shirt', price: 64, sleeve: 1.2, hem: 0.16, collar: 2, desc: 'Poplin, tucked in. For court dates and funerals.' },
    { id: 'hoodie', name: 'Hoodie', price: 48, sleeve: 1.2, hem: 0.02, collar: 0, pockets: 1, band: 1, weave: 2, inflate: 0.006, desc: 'Fleece pullover with a kangaroo pocket.' },
    { id: 'sweat', name: 'Sweatshirt', price: 40, sleeve: 1.2, hem: 0.04, collar: 0, band: 1, weave: 2, inflate: 0.005, desc: 'Loopback cotton crew.' },
    { id: 'sweater', name: 'Knit sweater', price: 70, sleeve: 1.2, hem: 0.04, collar: 0, band: 1, weave: 2, inflate: 0.007, desc: 'Chunky cable knit for the two cold days a year.' },
    { id: 'thermal', name: 'Thermal', price: 30, sleeve: 1.2, hem: 0.06, collar: 4, weave: 3, desc: 'Waffle-knit long underwear top.' },
    { id: 'jersey', name: 'Ball jersey', price: 55, sleeve: 0.34, hem: 0.02, collar: 1, desc: 'Mesh jersey from a team that never made the playoffs.' },
  ] },
  { k: 'outer', label: 'Jackets & vests', patterns: ['Solid', 'Camo', 'Plaid', 'Two-tone'], styles: [
    { id: 'denim', name: 'Denim jacket', price: 85, sleeve: 1.2, hem: 0.14, open: 1, rough: 0.85, weave: 1, inflate: 0.01, desc: 'Trucker-style, worn open.' },
    { id: 'leather', name: 'Leather jacket', price: 240, sleeve: 1.2, hem: 0.12, open: 1, rough: 0.42, weave: 5, inflate: 0.012, desc: 'Cowhide. Gets better every year.' },
    { id: 'bomber', name: 'Bomber jacket', price: 120, sleeve: 1.2, hem: 0.12, open: 0, rough: 0.6, inflate: 0.016, desc: 'Nylon flight jacket, ribbed cuffs.' },
    { id: 'canvas', name: 'Canvas work jacket', price: 110, sleeve: 1.2, hem: 0.06, open: 1, rough: 0.9, weave: 1, inflate: 0.014, desc: 'Duck canvas chore coat.' },
    { id: 'wind', name: 'Windbreaker', price: 60, sleeve: 1.2, hem: 0.08, open: 0, rough: 0.5, inflate: 0.01, desc: 'Packs into its own pocket.' },
    { id: 'slicker', name: 'Rain slicker', price: 75, sleeve: 1.2, hem: -0.15, open: 0, rough: 0.28, inflate: 0.016, desc: 'Long, rubberised, hurricane season ready.' },
    { id: 'puffer', name: 'Puffer vest', price: 90, sleeve: -1, hem: 0.1, open: 0, rough: 0.45, weave: 4, inflate: 0.026, desc: 'Quilted down vest. Sleeveless.' },
    { id: 'huntvest', name: 'Hunting vest', price: 45, sleeve: -1, hem: 0.1, open: 1, rough: 0.8, inflate: 0.014, desc: 'Shell loops and a game pouch. Comes in safety orange.' },
    { id: 'blazer', name: 'Suit jacket', price: 260, sleeve: 1.2, hem: 0.02, open: 1, rough: 0.7, inflate: 0.01, desc: 'Single-breasted wool. Wear it to the bank.' },
    { id: 'field', name: 'Field coat', price: 180, sleeve: 1.2, hem: -0.1, open: 1, rough: 0.85, weave: 1, inflate: 0.016, desc: 'Waxed cotton, corduroy collar, long.' },
  ] },
  { k: 'bottom', label: 'Pants & shorts', patterns: ['Solid', 'Denim wash', 'Camo', 'Plaid', 'Pinstripe'], styles: [
    { id: 'jeans', name: 'Jeans', price: 55, leg: -2, belt: 1, weave: 1, desc: 'Fourteen-ounce denim, straight leg.' },
    { id: 'workpants', name: 'Work pants', price: 48, leg: -2, belt: 1, weave: 1, desc: 'Double-knee duck canvas.' },
    { id: 'chinos', name: 'Chinos', price: 50, leg: -2, belt: 1, desc: 'Cotton twill trousers.' },
    { id: 'cargo', name: 'Cargo pants', price: 52, leg: -2, belt: 1, cargo: 1, desc: 'Six pockets, all of them full.' },
    { id: 'joggers', name: 'Joggers', price: 38, leg: -2, cuff: 1, weave: 2, desc: 'Fleece with ribbed ankle cuffs.' },
    { id: 'slacks', name: 'Dress slacks', price: 90, leg: -2, belt: 1, crease: 1, desc: 'Pressed wool, sharp crease.' },
    { id: 'overalls', name: 'Overalls', price: 70, leg: -2, overalls: 1, weave: 1, desc: 'Bib overalls with brass buckles.' },
    { id: 'shorts', name: 'Shorts', price: 30, leg: -0.32, belt: 1, desc: 'Above the knee.' },
    { id: 'cargoshorts', name: 'Cargo shorts', price: 34, leg: -0.38, belt: 1, cargo: 1, desc: 'Knee length, pockets for everything.' },
    { id: 'cutoffs', name: 'Cut-offs', price: 22, leg: -0.2, belt: 1, weave: 1, desc: 'Old jeans with the legs cut off. Frayed.' },
  ] },
  { k: 'shoes', label: 'Footwear', patterns: ['Plain', 'Two-tone'], styles: [
    { id: 'workboots', name: 'Work boots', price: 140, sole: 0, top: -0.7, rough: 0.75, desc: 'Steel toe, oil resistant.' },
    { id: 'cowboy', name: 'Cowboy boots', price: 220, sole: 0, top: -0.7, rough: 0.45, desc: 'Stitched shafts and a stacked heel.' },
    { id: 'sneakers', name: 'Sneakers', price: 70, sole: 1, top: -0.9, rough: 0.8, desc: 'Canvas low-tops with white soles.' },
    { id: 'hightops', name: 'High-tops', price: 95, sole: 1, top: -0.82, rough: 0.7, desc: 'Basketball shoes.' },
    { id: 'loafers', name: 'Loafers', price: 120, sole: 0, top: -0.93, rough: 0.4, desc: 'Leather penny loafers.' },
    { id: 'oxfords', name: 'Dress shoes', price: 160, sole: 0, top: -0.93, rough: 0.22, desc: 'Polished oxfords.' },
    { id: 'hikers', name: 'Hiking boots', price: 130, sole: 2, top: -0.78, rough: 0.8, desc: 'Waterproof, lugged soles.' },
    { id: 'rubber', name: 'Rubber boots', price: 40, sole: 1, top: -0.7, rough: 0.35, desc: 'White shrimp boots. Bayou formal.' },
    { id: 'slipons', name: 'Slip-ons', price: 45, sole: 1, top: -0.93, rough: 0.8, desc: 'Canvas, no laces.' },
    { id: 'runners', name: 'Running shoes', price: 110, sole: 1, top: -0.9, rough: 0.6, desc: 'Mesh trainers.' },
  ] },
  { k: 'hat', label: 'Hats', patterns: ['Solid', 'Camo', 'Two-tone'], styles: [
    { id: 'cap', name: 'Ball cap', price: 22, desc: 'Curved brim, six panels.' },
    { id: 'trucker', name: 'Trucker cap', price: 18, desc: 'Foam front, mesh back.' },
    { id: 'cowboy', name: 'Cowboy hat', price: 120, desc: 'Felt, cattleman crease.' },
    { id: 'fedora', name: 'Fedora', price: 85, desc: 'Wool felt with a grosgrain band.' },
    { id: 'beanie', name: 'Beanie', price: 16, desc: 'Ribbed knit with a cuff.' },
    { id: 'bucket', name: 'Bucket hat', price: 24, desc: 'Cotton, all-round brim.' },
    { id: 'straw', name: 'Straw hat', price: 30, desc: 'Wide brim for the sun.' },
    { id: 'flatcap', name: 'Flat cap', price: 40, desc: 'Tweed newsboy cap.' },
    { id: 'boonie', name: 'Boonie hat', price: 26, desc: 'Floppy brim, for fishing.' },
    { id: 'headwrap', name: 'Head bandana', price: 10, desc: 'Tied at the back.' },
  ] },
  { k: 'eye', label: 'Eyewear', patterns: ['Clear', 'Smoke', 'Amber', 'Mirror'], frames: true, styles: [
    { id: 'aviator', name: 'Aviators', price: 90, desc: 'Teardrop lenses, wire frame.' },
    { id: 'wayfarer', name: 'Wayfarers', price: 80, desc: 'Thick acetate frames.' },
    { id: 'round', name: 'Round frames', price: 70, desc: 'Small round lenses.' },
    { id: 'sport', name: 'Sport wraps', price: 110, desc: 'One curved lens. For boats.' },
    { id: 'readers', name: 'Reading glasses', price: 25, desc: 'Gas station readers.' },
    { id: 'clubmaster', name: 'Browline', price: 95, desc: 'Heavy brow, thin wire rims.' },
    { id: 'square', name: 'Square frames', price: 75, desc: 'Bold and square.' },
    { id: 'cateye', name: 'Cat-eye', price: 85, desc: 'Swept-up corners.' },
    { id: 'shield', name: 'Shield', price: 100, desc: 'One flat lens, edge to edge.' },
    { id: 'safety', name: 'Safety glasses', price: 12, desc: 'ANSI rated, side shields.' },
  ] },
  { k: 'neck', label: 'Neckwear', patterns: ['Solid', 'Patterned'], styles: [
    { id: 'bandana', name: 'Neck bandana', price: 10, desc: 'Cotton square tied at the throat.' },
    { id: 'scarf', name: 'Scarf', price: 35, desc: 'Wool, wrapped once.' },
    { id: 'tie', name: 'Necktie', price: 45, desc: 'Silk, four-in-hand knot.' },
    { id: 'bowtie', name: 'Bow tie', price: 40, desc: 'Self-tie.' },
    { id: 'bolo', name: 'Bolo tie', price: 60, desc: 'Braided cord with a silver slide.' },
  ] },
  { k: 'gloves', label: 'Gloves', patterns: ['Plain', 'Two-tone'], styles: [
    { id: 'work', name: 'Work gloves', price: 20, rough: 0.85, desc: 'Leather palms, knit cuffs.' },
    { id: 'driving', name: 'Driving gloves', price: 60, rough: 0.4, desc: 'Thin leather, perforated.' },
    { id: 'fingerless', name: 'Fingerless gloves', price: 18, fingerless: 1, rough: 0.8, desc: 'Fingertips free for the trigger.' },
    { id: 'rubber', name: 'Rubber gloves', price: 8, rough: 0.3, desc: 'For gutting fish.' },
    { id: 'wool', name: 'Wool gloves', price: 22, rough: 0.95, desc: 'Knitted.' },
  ] },
];
export const SLOT = Object.fromEntries(SLOTS.map((s) => [s.k, s]));
export const slotCount = (s) => s.styles.length * s.patterns.length * (s.frames ? FRAME_COLORS.length : COLORS.length);
export const CATALOG_SIZE = SLOTS.reduce((a, s) => a + slotCount(s), 0); // 13,500

// an item key: slot:style:pattern:colour (indices)
export const itemKey = (slot, style, pat, col) => `${slot}:${style}:${pat}:${col}`;
export function parseKey(key) {
  if (!key) return null;
  const [k, sid, p, c] = key.split(':');
  const s = SLOT[k]; if (!s) return null;
  const style = s.styles.find((x) => x.id === sid); if (!style) return null;
  const pal = s.frames ? FRAME_COLORS : COLORS;
  return { slot: s, style, pat: +p, col: +c, pattern: s.patterns[+p], color: pal[+c] || pal[0] };
}
export function itemName(key) {
  const it = parseKey(key); if (!it) return '';
  if (it.slot.frames) return `${it.style.name} · ${it.color[0]} frame, ${it.pattern.toLowerCase()} lens`;
  return `${it.style.name} · ${it.pattern === 'Solid' || it.pattern === 'Plain' ? '' : it.pattern + ', '}${it.color[0]}`;
}
export function itemPrice(key, k = 1) {
  const it = parseKey(key); if (!it) return 0;
  const pm = [1, 1.15, 1.2, 1.1, 0.9, 1.1][it.pat] || 1;
  return Math.max(5, Math.round((it.style.price * pm * k) / 5) * 5);
}

export const DEFAULT_OUTFIT = {
  top: itemKey('top', 'flannel', 2, COLORS.findIndex((c) => c[0] === 'Brick red')), // untucked: hides a waistband holster
  outer: null,
  bottom: itemKey('bottom', 'jeans', 1, COLORS.findIndex((c) => c[0] === 'Indigo')),
  shoes: itemKey('shoes', 'workboots', 0, COLORS.findIndex((c) => c[0] === 'Brown')),
  hat: null, eye: null, neck: null, gloves: null,
};

// ---------------------------------------------------------------- shader
const GLSL_COMMON = `
varying vec3 vOfP; varying float vOfArm;
uniform vec3 uTopC, uOutC, uBotC, uSkinC, uShoeC, uGloveC;
uniform vec4 uTop, uTop2, uOut, uOut2, uBot, uBot2, uShoe, uGlove;
uniform float uOutInfTop;`;
const GLSL_FRAG = `${GLSL_COMMON}
uniform float uMapLum;
float ofRough = -1.0; float ofTex = 1.0; float ofBare = 0.0;
float ofh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ofn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(ofh(i), ofh(i+vec2(1,0)), f.x), mix(ofh(i+vec2(0,1)), ofh(i+vec2(1,1)), f.x), f.y); }
vec3 ofAccent(vec3 c){ float l = dot(c, vec3(0.3, 0.59, 0.11)); return l > 0.3 ? c * 0.38 : mix(c, vec3(0.9, 0.88, 0.84), 0.6); }
vec3 ofPat(float id, vec3 c, vec3 p){
  vec2 q = vec2(p.x + p.z * 0.6, p.y);
  vec3 a = ofAccent(c);
  if (id < 0.5) return c;
  if (id < 1.5) return mix(c, a, step(0.62, fract(q.y * 26.0)));
  if (id < 2.5) {
    float h = smoothstep(0.55, 0.6, fract(q.x * 7.0)) * (1.0 - smoothstep(0.85, 0.9, fract(q.x * 7.0)));
    float v = smoothstep(0.55, 0.6, fract(q.y * 7.0)) * (1.0 - smoothstep(0.85, 0.9, fract(q.y * 7.0)));
    vec3 col = mix(c, c * 0.42, (h + v) * 0.42);
    float thin = max(smoothstep(0.035, 0.0, abs(fract(q.x * 7.0 + 0.27) - 0.5)), smoothstep(0.035, 0.0, abs(fract(q.y * 7.0 + 0.27) - 0.5)));
    return mix(col, mix(c, vec3(0.9, 0.86, 0.7), 0.6), thin * 0.6);
  }
  if (id < 3.5) { float n = ofn(q * 9.0) * 0.6 + ofn(q * 23.0 + 4.0) * 0.4; return n < 0.42 ? c : n < 0.56 ? mix(c, vec3(0.42, 0.37, 0.27), 0.65) : c * 0.45; }
  if (id < 4.5) return c * (0.82 + 0.3 * ofn(q * 14.0)) + vec3(0.04) * ofn(q * 40.0);
  if (id < 5.5) return c;
  if (id < 6.5) return c * (0.74 + 0.32 * ofn(vec2(q.x * 7.0, q.y * 3.0))) * (0.94 + 0.08 * step(0.5, fract((q.x + q.y) * 180.0)));
  if (id < 7.5) return mix(c, a, step(0.94, fract(q.x * 40.0)) * 0.7);
  return c;
}
vec3 ofWeave(float w, vec3 c, vec3 p){
  vec2 q = vec2(p.x + p.z * 0.6, p.y);
  if (w < 0.5) return c;
  if (w < 1.5) return c * (0.93 + 0.1 * step(0.5, fract((q.x + q.y) * 190.0)));
  if (w < 2.5) return c * (0.9 + 0.14 * abs(sin(q.x * 260.0)));
  if (w < 3.5) { vec2 g = abs(fract(q * 90.0) - 0.5); return c * (0.9 + 0.16 * max(g.x, g.y)); }
  if (w < 4.5) return c * (0.78 + 0.27 * smoothstep(0.0, 0.5, abs(fract(q.y * 14.0) - 0.5)));
  return c * (0.9 + 0.12 * ofn(q * 120.0));
}
vec3 ofSuit(vec3 p, float armF){
  float arm = step(0.5, armF);
  float t = (abs(p.x) - 0.2) / 0.42;
  float y = p.y;
  ofRough = 0.85;
  float fr = step(-0.03, p.z);
  float open = (uOut2.x > 0.5 && arm < 0.5 && abs(p.x) < 0.05 && fr > 0.5 && y < 0.63) ? 1.0 : 0.0;
  if (uOut.x > -0.5 && open < 0.5 && (arm > 0.5 ? t < uOut.z : y > uOut.w)) {
    vec3 c = (uOut.y > 4.5 && uOut.y < 5.5 && arm > 0.5) ? ofAccent(uOutC) : uOutC;
    c = ofWeave(uOut2.w, ofPat(uOut.y, c, p), p);
    if (uOut2.x < 0.5 && arm < 0.5 && abs(p.x) < 0.005 && fr > 0.5) c *= 0.45;
    if (arm > 0.5 && t > uOut.z - 0.06) c *= 0.82;
    if (arm < 0.5 && y < uOut.w + 0.035) c *= 0.85;
    if (arm < 0.5 && y > 0.68 && fr > 0.5) c *= 0.8;
    ofRough = uOut2.y; return c;
  }
  if (arm > 0.5) {
    if (t > uTop.z) { ofTex = 0.12; ofRough = 0.5; ofBare = 1.0; return uSkinC; }
    vec3 c = (uTop.x > 4.5 && uTop.x < 5.5) ? ofAccent(uTopC) : uTopC;
    c = ofWeave(uTop.y, ofPat(uTop.x, c, p), p);
    if (t > uTop.z - 0.05 && uTop.z < 1.0) c *= 0.84;
    return c;
  }
  if (uBot.w > 0.5 && y > uTop.w - 0.1 && ((abs(p.x) < 0.11 && p.z > -0.07 && y < 0.5) || (abs(abs(p.x) - 0.075) < 0.02 && y < 0.73))) {
    vec3 c = ofWeave(uBot.y, ofPat(uBot.x, uBotC, p), p);
    if (abs(abs(p.x) - 0.075) < 0.02 && y > 0.48 && y < 0.51 && p.z > -0.07) c = vec3(0.75, 0.6, 0.3);
    return c;
  }
  if (y > uTop.w) {
    if (uTop.z < 0.0 && ((abs(p.x) > 0.11 && y > 0.58) || (y > 0.63 && fr > 0.5))) { ofTex = 0.12; ofRough = 0.5; ofBare = 1.0; return uSkinC; }
    if (uTop2.x > 0.5 && uTop2.x < 1.5 && fr > 0.5 && y > 0.6 && abs(p.x) < (y - 0.6) * 0.9) { ofTex = 0.12; ofRough = 0.5; ofBare = 1.0; return uSkinC; }
    vec3 c = (uTop.x > 4.5 && uTop.x < 5.5 && y > 0.62) ? ofAccent(uTopC) : uTopC;
    if (uTop2.w > 0.5 && y > 0.6 && y < 0.6 + 0.04 * (1.0 - abs(p.x) * 6.0)) c *= 0.75;
    c = ofWeave(uTop.y, ofPat(uTop.x, c, p), p);
    if (uTop2.x > 1.5 && abs(p.x) < 0.007 && fr > 0.5 && y < 0.72 && y > (uTop2.x > 2.5 ? 0.58 : uTop.w)) { c *= 0.78; if (fract(y * 16.0) < 0.16) c = mix(c, vec3(0.92, 0.9, 0.85), 0.7); }
    if (uTop2.y > 0.5 && uTop2.y < 1.5 && abs(p.x) < 0.09 && y > uTop.w + 0.03 && y < uTop.w + 0.15 && fr > 0.5) c *= 0.8;
    if (uTop2.y > 1.5 && abs(abs(p.x) - 0.075) < 0.035 && y > 0.48 && y < 0.57 && fr > 0.5) c *= (y > 0.555 ? 0.7 : 0.86);
    if (uTop2.z > 0.5 && y < uTop.w + 0.03) c *= 0.82;
    return c;
  }
  if (y < uBot.z) { ofTex = 0.12; ofRough = 0.5; ofBare = 1.0; return uSkinC; }
  vec3 c = ofWeave(uBot.y, ofPat(uBot.x, uBotC, p), p);
  if (uBot2.x > 0.5 && y > 0.125 && y < 0.16) { c = vec3(0.16, 0.1, 0.06); if (abs(p.x) < 0.025 && fr > 0.5) c = vec3(0.75, 0.6, 0.3); ofRough = 0.5; }
  if (uBot.z > -1.0 && y < uBot.z + 0.022) c = mix(c, vec3(0.85, 0.82, 0.75), 0.5 * ofn(p.xz * 200.0 + p.y * 50.0));
  if (uBot2.y > 0.5 && abs(p.x) > 0.17 && y > -0.32 && y < -0.12) c *= (y > -0.15 ? 0.72 : 0.86);
  if (uBot2.z > 0.5 && y < -0.82) c *= 0.8;
  if (uBot2.w > 0.5 && abs(abs(p.x) - 0.11) < 0.003 && p.z > -0.06) c *= 0.8;
  return c;
}
vec3 ofShoe(vec3 p){
  ofRough = uShoe.z;
  if (p.y > uShoe.y) {
    if (uBot.z < -1.0) { ofRough = 0.85; return ofWeave(uBot.y, ofPat(uBot.x, uBotC, p), p); }
    ofTex = 0.4; ofRough = 0.9; return vec3(0.9, 0.9, 0.88);
  }
  vec3 c = uShoeC;
  if (uShoe.w > 0.5 && (p.z > 0.03 || p.y > uShoe.y - 0.03)) c = ofAccent(c);
  if (p.y < -0.972) { c = uShoe.x < 0.5 ? vec3(0.06, 0.05, 0.045) : uShoe.x < 1.5 ? vec3(0.9, 0.9, 0.88) : vec3(0.62, 0.45, 0.28); ofRough = 0.7; }
  return c;
}
vec3 ofSkin(vec3 p, vec3 base){
  ofTex = -1.0;
  if (uGlove.x > -0.5 && abs(p.x) > 0.565 && p.y < 0.275 && (uGlove.y < 0.5 || p.y > 0.16)) {
    ofTex = 0.5; ofRough = uGlove.z;
    vec3 c = uGloveC; if (uGlove.w > 0.5 && p.y > 0.235) c = ofAccent(c);
    return c;
  }
  return base;
}`;

function mapLum(tex, mat) {
  if (mat?.userData?.sbLum !== undefined) return mat.userData.sbLum; // measured when the texture was compressed (tools/southbound/pack-ktx2.mjs)
  try {
    const img = tex?.image; if (!img) return 0.5;
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 16, 16);
    const d = x.getImageData(0, 0, 16, 16).data; let s = 0;
    for (let i = 0; i < d.length; i += 4) s += Math.pow((d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255, 2.2);
    return Math.max(0.05, s / 256);
  } catch { return 0.5; }
}

function outfitMaterial(src, U, part) {
  const m = src.clone();
  m.name = src.name;
  const lum = { value: mapLum(src.map, src) };
  m.defines = { ...(m.defines || {}), ['OF_' + part.toUpperCase()]: '' };
  m.customProgramCacheKey = () => 'outfit-' + part;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uMapLum: lum });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL_COMMON}\n#ifdef OF_SUIT\nattribute float aArm;\n#endif`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3( position ); vOfP = position;
#ifdef OF_SUIT
  vOfArm = aArm;
  float ofT = (abs(position.x) - 0.2) / 0.42;
  bool ofOpen = uOut2.x > 0.5 && aArm < 0.5 && abs(position.x) < 0.05 && position.z > -0.03 && position.y < 0.63;
  float ofJ = (uOut.x > -0.5 && !ofOpen && (aArm > 0.5 ? ofT < uOut.z : position.y > uOut.w)) ? 1.0 : 0.0;
  float ofTopOn = aArm > 0.5 ? step(ofT, uTop.z) : step(uTop.w, position.y);
  float ofBareV = (1.0 - ofJ) * ((aArm > 0.5 && ofT > uTop.z) ? 1.0 : (aArm < 0.5 && position.y < uBot.z && position.y < uTop.w) ? 1.0 : 0.0);
  transformed += normal * (ofJ * uOut2.z + (1.0 - ofJ) * ofTopOn * uOutInfTop - ofBareV * 0.014);
#else
  vOfArm = 0.0;
#endif`)
    const body = part === 'suit' ? 'ofSuit(vOfP, vOfArm)' : part === 'shoes' ? 'ofShoe(vOfP)' : 'ofSkin(vOfP, diffuse)';
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_FRAG}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `vec4 diffuseColor = vec4( ${body}, opacity );`)
      .replace('#include <map_fragment>', `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  if (ofTex < 0.0) diffuseColor *= sampledDiffuseColor;
  else { float ofL = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114)) / uMapLum; diffuseColor.rgb *= mix(1.0, clamp(ofL, 0.55, 1.35), ofTex); }
#endif`)
      .replace('#include <normal_fragment_maps>', 'if (ofBare < 0.5) {\n#include <normal_fragment_maps>\n}')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  if (ofRough >= 0.0) roughnessFactor = ofRough;');
  };
  m.needsUpdate = true;
  return m;
}

// which suit vertices belong to the arms (by their strongest bone)
function armAttribute(mesh) {
  const g = mesh.geometry;
  if (g.attributes.aArm) return;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = mesh.skeleton.bones;
  const arr = new Float32Array(si.count);
  const isArm = bones.map((b) => /upperarm|lowerarm|wrist|shoulder01|finger|metacarpal/i.test(b.name));
  for (let i = 0; i < si.count; i++) {
    let best = 0, bw = -1;
    for (let c = 0; c < 4; c++) { const w = sw.getComponent(i, c); if (w > bw) { bw = w; best = si.getComponent(i, c); } }
    arr[i] = isArm[best] ? 1 : 0;
  }
  const attr = new THREE.BufferAttribute(arr, 1);
  for (const lg of g.userData.lodSet || [g]) lg.setAttribute('aArm', attr); // every level of detail (core/lod.js) shares it
}

// ---------------------------------------------------------------- accessories
const mat = (c, r = 0.7, m = 0, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...extra });
const accent = (hex) => { const c = new THREE.Color(hex); const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11; return l > 0.3 ? c.multiplyScalar(0.38) : c.lerp(new THREE.Color(0.9, 0.88, 0.84), 0.6); };
function camoTex(hex) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const base = new THREE.Color(hex);
  x.fillStyle = '#' + base.getHexString(); x.fillRect(0, 0, 64, 64);
  const tones = [base.clone().multiplyScalar(0.45), base.clone().lerp(new THREE.Color(0.42, 0.37, 0.27), 0.65)];
  let s = hex % 997;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) { x.fillStyle = '#' + tones[i % 2].getHexString(); x.beginPath(); x.ellipse(r() * 64, r() * 64, 4 + r() * 9, 3 + r() * 6, r() * 3, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function fabric(it, r = 0.85) {
  const hex = it.color[1];
  if (it.pattern === 'Camo') return mat(0xffffff, r, 0, { map: camoTex(hex) });
  return mat(hex, r);
}

// hat models: built in metres around the top of the head, +z forward
function buildHat(it) {
  const g = new THREE.Group(), id = it.style.id, cm = fabric(it), two = it.pattern === 'Two-tone';
  const second = two ? mat(accent(it.color[1]), 0.8) : cm;
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  if (id === 'cap' || id === 'trucker') {
    const crown = add(new THREE.SphereGeometry(0.11, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), id === 'trucker' ? mat(two ? accent(it.color[1]) : 0x2a2a2a, 0.95) : cm);
    crown.scale.set(1, 0.84, 1.14);
    if (id === 'trucker') { const front = add(new THREE.SphereGeometry(0.11, 20, 10, -Math.PI * 0.3, Math.PI * 0.6, 0, Math.PI / 2), cm); front.scale.set(1, 0.86, 1.12); }
    const brim = add(new THREE.CylinderGeometry(0.1, 0.1, 0.008, 20, 1, false, -Math.PI / 2, Math.PI), two && id === 'cap' ? second : cm, 0, 0.004, 0.07);
    brim.scale.set(0.95, 1, 0.75); brim.rotation.x = 0.12;
    add(new THREE.SphereGeometry(0.012, 8, 6), cm, 0, 0.088, 0);
  } else if (id === 'cowboy' || id === 'fedora' || id === 'straw') {
    const wide = id === 'cowboy' ? 0.2 : id === 'straw' ? 0.24 : 0.155;
    const crownM = id === 'straw' ? mat(it.color[1], 0.95) : cm;
    const crown = add(new THREE.CylinderGeometry(0.088, 0.104, id === 'fedora' ? 0.11 : 0.125, 24), crownM, 0, 0.05, 0);
    crown.scale.set(0.96, 1, 1.18);
    const dent = add(new THREE.SphereGeometry(0.09, 18, 6, 0, Math.PI * 2, 0, 0.5), crownM, 0, 0.065, 0); dent.scale.set(0.94, 0.35, 1.15);
    const ring = new THREE.RingGeometry(0.098, wide, 40, 3); ring.rotateX(-Math.PI / 2);
    const P = ring.attributes.position;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i), rr = Math.hypot(x, z); const k = (rr - 0.098) / (wide - 0.098); P.setY(i, id === 'cowboy' ? Math.pow(Math.abs(x) / wide, 2) * 0.06 * k - (z > 0 ? k * 0.012 : 0) : id === 'fedora' ? -k * 0.015 * (z > 0 ? 1.4 : 0.4) : -k * k * 0.03); }
    ring.computeVertexNormals();
    const brim = add(ring, crownM, 0, -0.008, 0); brim.material = crownM.clone(); brim.material.side = THREE.DoubleSide;
    add(new THREE.CylinderGeometry(0.105, 0.105, 0.022, 24, 1, true), mat(two ? accent(it.color[1]) : 0x1a1410, 0.7), 0, 0.006, 0).scale.set(0.96, 1, 1.18);
  } else if (id === 'beanie') {
    const b = add(new THREE.SphereGeometry(0.114, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), cm, 0, -0.01, 0); b.scale.set(1, 1.08, 1.12);
    add(new THREE.CylinderGeometry(0.118, 0.118, 0.04, 24, 1, true), second, 0, -0.012, 0).scale.set(1, 1, 1.12);
  } else if (id === 'bucket' || id === 'boonie') {
    add(new THREE.CylinderGeometry(0.092, 0.106, 0.095, 24), cm, 0, 0.032, 0).scale.set(0.97, 1, 1.18);
    const br = add(new THREE.CylinderGeometry(0.105, id === 'boonie' ? 0.17 : 0.15, id === 'boonie' ? 0.03 : 0.05, 28, 1, true), cm, 0, -0.025, 0);
    br.material = cm.clone(); br.material.side = THREE.DoubleSide; br.scale.set(0.97, 1, 1.18);
    if (two) add(new THREE.CylinderGeometry(0.105, 0.105, 0.018, 24, 1, true), second, 0, -0.005, 0).scale.set(0.95, 1, 1.08);
  } else if (id === 'flatcap') {
    const c = add(new THREE.SphereGeometry(0.115, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), cm, 0, -0.005, 0.012); c.scale.set(1, 0.5, 1.2);
    const brim = add(new THREE.CylinderGeometry(0.09, 0.09, 0.008, 16, 1, false, -Math.PI / 2, Math.PI), two ? second : cm, 0, 0.0, 0.085); brim.scale.set(0.9, 1, 0.45);
  } else if (id === 'headwrap') {
    const b = add(new THREE.SphereGeometry(0.112, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), cm, 0, -0.01, 0); b.scale.set(1, 0.9, 1.12);
    add(new THREE.SphereGeometry(0.022, 8, 6), cm, 0, -0.02, -0.12); add(new THREE.ConeGeometry(0.03, 0.08, 6), cm, 0.02, -0.07, -0.12);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.noHit = true; } });
  return g;
}

function buildGlasses(it) {
  const g = new THREE.Group(), id = it.style.id;
  const tint = [[0xdfe8ee, 0.18, 0.05, 0], [0x0c0c0c, 0.82, 0.08, 0.2], [0xb06a10, 0.6, 0.1, 0.1], [0x8aa6c0, 0.9, 0.04, 1]][it.pat];
  const lens = mat(tint[0], tint[2], tint[3], { transparent: true, opacity: tint[1] });
  const frameM = mat(it.color[1], id === 'aviator' || id === 'clubmaster' ? 0.3 : 0.4, id === 'aviator' ? 0.8 : 0.1);
  const thick = { wayfarer: 0.007, square: 0.008, cateye: 0.006, clubmaster: 0.002, aviator: 0.0018, round: 0.0022, readers: 0.0025, sport: 0.003, shield: 0.003, safety: 0.004 }[id] || 0.003;
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  if (id === 'sport' || id === 'shield' || id === 'safety') {
    const L = add(new THREE.CylinderGeometry(0.1, 0.1, id === 'shield' ? 0.05 : 0.04, 24, 1, true, -0.62, 1.24), lens, 0, 0, -0.085);
    L.material.side = THREE.DoubleSide;
    add(new THREE.BoxGeometry(0.13, thick, 0.01), frameM, 0, id === 'shield' ? 0.026 : 0.021, 0.01);
    if (id === 'safety') for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.004, 0.035, 0.03), lens, s * 0.07, 0, -0.01);
  } else {
    for (const s of [-1, 1]) {
      const shape = { aviator: [0.026, 0.024], round: [0.02, 0.02], readers: [0.024, 0.014], cateye: [0.026, 0.019], square: [0.026, 0.024], wayfarer: [0.026, 0.02], clubmaster: [0.025, 0.02] }[id] || [0.025, 0.02];
      const l = add(new THREE.CircleGeometry(1, id === 'round' || id === 'aviator' ? 24 : 4), lens, s * 0.033, 0, 0);
      l.scale.set(shape[0], shape[1], 1); if (!(id === 'round' || id === 'aviator')) l.rotation.z = Math.PI / 4, l.scale.set(shape[0] * 1.3, shape[1] * 1.3, 1);
      if (id === 'aviator') l.position.y -= 0.004;
      if (id === 'cateye') l.rotation.z += s * 0.25;
      const rim = add(new THREE.TorusGeometry(1, thick * 18, 4, id === 'round' || id === 'aviator' ? 24 : 4), frameM, s * 0.033, 0, 0);
      rim.scale.set(shape[0], shape[1], 0.004); rim.rotation.copy(l.rotation); if (!(id === 'round' || id === 'aviator')) rim.scale.set(shape[0] * 1.3, shape[1] * 1.3, 0.004);
      if (id === 'aviator') rim.position.y -= 0.004;
      if (id === 'clubmaster' || id === 'wayfarer') add(new THREE.BoxGeometry(0.05, 0.008, 0.006), frameM, s * 0.033, 0.016, 0.001);
      add(new THREE.BoxGeometry(0.003, 0.004, 0.1), frameM, s * 0.066, 0.008, -0.05); // temples
    }
    add(new THREE.BoxGeometry(0.016, 0.003, 0.003), frameM, 0, 0.008, 0);
    if (id === 'aviator') add(new THREE.BoxGeometry(0.03, 0.002, 0.002), frameM, 0, 0.018, 0);
  }
  g.traverse((o) => { if (o.isMesh) o.userData.noHit = true; });
  return g;
}

// neckwear, built around the collar: origin at the front of the throat
function buildNeck(it) {
  const g = new THREE.Group(), id = it.style.id;
  const cm = it.pattern === 'Patterned' ? mat(0xffffff, 0.75, 0, { map: plaidTex(it.color[1]) }) : mat(it.color[1], 0.75);
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  if (id === 'bandana' || id === 'scarf') {
    const t = add(new THREE.TorusGeometry(0.075, id === 'scarf' ? 0.028 : 0.016, 8, 24), cm, 0, 0, -0.07); t.rotation.x = Math.PI / 2 - 0.25; t.scale.set(1, 1.15, 1);
    if (id === 'bandana') { const tri = add(new THREE.ConeGeometry(0.06, 0.1, 3), cm, 0, -0.05, 0.0); tri.rotation.set(Math.PI, 0, 0); tri.scale.set(1, 1, 0.25); }
    else { add(new THREE.BoxGeometry(0.06, 0.26, 0.02), cm, 0.035, -0.13, 0.015).rotation.z = 0.06; }
  } else if (id === 'tie') {
    add(new THREE.BoxGeometry(0.028, 0.026, 0.02), cm, 0, -0.012, 0);
    const shape = new THREE.Shape(); shape.moveTo(-0.013, 0); shape.lineTo(0.013, 0); shape.lineTo(0.042, -0.36); shape.lineTo(0, -0.39); shape.lineTo(-0.042, -0.36); shape.closePath();
    const tie = add(new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: false }), cm, 0, -0.022, 0.004);
    tie.rotation.x = -0.18;
  } else if (id === 'bowtie') {
    for (const s of [-1, 1]) { const c = add(new THREE.ConeGeometry(0.022, 0.05, 4), cm, s * 0.025, -0.012, 0.004); c.rotation.z = s * Math.PI / 2; c.scale.set(1, 1, 0.4); }
    add(new THREE.BoxGeometry(0.014, 0.02, 0.014), cm, 0, -0.012, 0.006);
  } else if (id === 'bolo') {
    const cord = mat(0x1a1410, 0.8);
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.0025, 0.0025, 0.26, 4), cord, s * 0.01, -0.14, 0.012).rotation.x = -0.14;
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.006, 16), mat(0xc0c4c8, 0.25, 1), 0, -0.05, 0.012).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.011, 0.011, 0.008, 12), mat(it.color[1], 0.35), 0, -0.05, 0.016).rotation.x = Math.PI / 2;
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.noHit = true; } });
  return g;
}
function plaidTex(hex) {
  const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d');
  const base = new THREE.Color(hex), a = accent(hex);
  x.fillStyle = '#' + base.getHexString(); x.fillRect(0, 0, 32, 32);
  x.fillStyle = '#' + a.getHexString(); x.globalAlpha = 0.6; x.fillRect(0, 10, 32, 6); x.fillRect(10, 0, 6, 32); x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); return t;
}

// ---------------------------------------------------------------- outfitter
const _m = new THREE.Matrix4(), _s = new THREE.Vector3();
// Attach `obj` (built in metres) rigidly to a bone so it moves exactly like
// the skin there; `at` is its position in the mesh's own (bind) units.
export function attachToBone(mesh, boneName, obj, at, metres) {
  const bones = mesh.skeleton.bones, i = bones.findIndex((b) => b.name === boneName);
  if (i < 0) return false;
  const bone = bones[i];
  const A = new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1).multiplyScalar(1 / metres));
  obj.matrixAutoUpdate = false;
  obj.matrix.copy(mesh.skeleton.boneInverses[i]).multiply(mesh.bindMatrix).multiply(A);
  bone.add(obj);
  return true;
}

function avgColor(tex, mat) {
  const a = mat?.userData?.sbAvg; if (a) return new THREE.Color().setRGB(a[0], a[1], a[2]);
  try {
    const img = tex?.image; if (!img) return null;
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 32, 32);
    const d = x.getImageData(8, 8, 16, 16).data; const s = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) s[k] += Math.pow(d[i + k] / 255, 2.2);
    return new THREE.Color().setRGB(s[0] / 256, s[1] / 256, s[2] / 256);
  } catch { return null; }
}
// metres per mesh unit for a person's skinned body (bind pose)
export function bodyMetres(h, mesh) {
  const sk = mesh.skeleton; h.root.updateMatrixWorld(true);
  _m.multiplyMatrices(sk.bones[0].matrixWorld, sk.boneInverses[0]).multiply(mesh.bindMatrix);
  _s.setFromMatrixColumn(_m, 0);
  const rs = new THREE.Vector3().setFromMatrixScale(h.root.matrixWorld).x || 1;
  return _s.length() / rs;
}
export function suitMesh(h) { let m = null; h.model.traverse((o) => { if (o.isSkinnedMesh && o.material?.name === 'suit') m = o; }); return m; }
export function makeOutfitter(h, skinHex = 0xc68e6a) {
  const meshes = {};
  h.model.traverse((o) => { if (o.isSkinnedMesh && o.material?.name) meshes[o.material.name] = o; });
  if (!meshes.suit) return { apply() {}, ok: false };
  armAttribute(meshes.suit);
  const tone = meshes.skin && avgColor(meshes.skin.material.map, meshes.skin.material);
  const v4 = () => ({ value: new THREE.Vector4() }), col = () => ({ value: new THREE.Color() });
  const U = { uTopC: col(), uOutC: col(), uBotC: col(), uSkinC: col(), uShoeC: col(), uGloveC: col(),
    uTop: v4(), uTop2: v4(), uOut: v4(), uOut2: v4(), uBot: v4(), uBot2: v4(), uShoe: v4(), uGlove: v4(), uOutInfTop: { value: 0 } };
  U.uSkinC.value.set(skinHex);
  if (tone) U.uSkinC.value.copy(tone).multiply(meshes.skin.material.color);
  for (const part of ['suit', 'shoes', 'skin']) if (meshes[part]) meshes[part].material = outfitMaterial(meshes[part].material, U, part);
  const extras = [];
  // how many metres one mesh unit is, from the skinning transform
  const metresPerUnit = () => {
    const sk = meshes.suit.skeleton; h.root.updateMatrixWorld(true);
    _m.multiplyMatrices(sk.bones[0].matrixWorld, sk.boneInverses[0]).multiply(meshes.suit.bindMatrix);
    _s.setFromMatrixColumn(_m, 0);
    const rs = new THREE.Vector3().setFromMatrixScale(h.root.matrixWorld).x || 1;
    return _s.length() / rs;
  };
  let headShown = true;
  return {
    ok: true, U, meshes,
    // first person: hats and glasses would sit in front of the camera
    headVisible(v) { headShown = v; for (const e of extras) if (e.userData.head) e.visible = v; },
    apply(o) {
      const top = parseKey(o.top), out = parseKey(o.outer), bot = parseKey(o.bottom), sh = parseKey(o.shoes), gl = parseKey(o.gloves);
      if (top) {
        const s = top.style;
        U.uTopC.value.setHex(top.color[1]);
        U.uTop.value.set(PAT[top.pattern] ?? 0, s.weave || 0, s.sleeve, s.hem);
        U.uTop2.value.set(s.collar || 0, s.pockets || 0, s.band || 0, s.yoke || 0);
        U.uOutInfTop.value = s.inflate || 0;
      } else { U.uTopC.value.copy(U.uSkinC.value); U.uTop.value.set(0, 0, -2, 0.16); U.uTop2.value.set(0, 0, 0, 0); U.uOutInfTop.value = 0; }
      if (out) { const s = out.style; U.uOutC.value.setHex(out.color[1]); U.uOut.value.set(1, PAT[out.pattern] ?? 0, s.sleeve, s.hem); U.uOut2.value.set(s.open || 0, s.rough ?? 0.8, s.inflate || 0.01, s.weave || 0); }
      else U.uOut.value.set(-1, 0, 0, 9);
      if (bot) { const s = bot.style; U.uBotC.value.setHex(bot.color[1]); U.uBot.value.set(PAT[bot.pattern] ?? 0, s.weave || 0, s.leg, s.overalls || 0); U.uBot2.value.set(s.belt || 0, s.cargo || 0, s.cuff || 0, s.crease || 0); }
      else { U.uBotC.value.set(0x222222); U.uBot.value.set(0, 0, 0.0, 0); U.uBot2.value.set(0, 0, 0, 0); }
      if (sh) { const s = sh.style; U.uShoeC.value.setHex(sh.color[1]); U.uShoe.value.set(s.sole, s.top, s.rough, sh.pat); }
      if (gl) { const s = gl.style; U.uGloveC.value.setHex(gl.color[1]); U.uGlove.value.set(1, s.fingerless || 0, s.rough, gl.pat); }
      else U.uGlove.value.set(-1, 0, 0, 0);
      // models on the head and neck
      for (const e of extras) e.parent?.remove(e);
      extras.length = 0;
      const mpu = metresPerUnit();
      const hat = parseKey(o.hat), eye = parseKey(o.eye), neck = parseKey(o.neck);
      if (hat) { const m = buildHat(hat); m.userData.head = true; m.visible = headShown; if (attachToBone(meshes.suit, 'head', m, [0, 0.914, -0.078], mpu)) extras.push(m); }
      if (eye) { const m = buildGlasses(eye); m.userData.head = true; m.visible = headShown; if (attachToBone(meshes.suit, 'head', m, [0, 0.862, 0.038], mpu)) extras.push(m); }
      if (neck) { const m = buildNeck(neck); if (attachToBone(meshes.suit, neck.style.id === 'tie' || neck.style.id === 'bolo' ? 'spine01' : 'neck01', m, [0, neck.style.id === 'bandana' || neck.style.id === 'scarf' ? 0.68 : 0.705, -0.005], mpu)) extras.push(m); }
      if (meshes.hair) meshes.hair.visible = !(hat && ['beanie', 'headwrap'].includes(hat.style.id));
    },
  };
}
