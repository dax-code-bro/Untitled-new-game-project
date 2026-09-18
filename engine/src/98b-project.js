/* ============================================================
   PROJECT — a world point, in screen pixels.
   ============================================================
   The engine could turn a pixel into a ray and had no way back. Every
   HUD marker in the game -- a name over a head, the arrow that says
   YOU in a kill cam, the arc showing where a grenade lands -- needs
   the other direction, and each of them had been faking it with a
   dot in the middle of the screen.

   `behind` matters as much as the coordinates. A point behind the
   camera still divides to a perfectly plausible pair of numbers, on
   the WRONG side of the screen, so a caller that does not check it
   draws a marker for a thing that is behind the player's head. It is
   checked once here rather than eleven times badly.

   This file sorts after 95-engine.js, which is the whole reason it is
   its own file: everything in engine/src shares one scope and one
   IIFE, and `class Engine` is in the temporal dead zone until its own
   file has run.
   ============================================================ */

Engine.prototype.project = function (point) {
  const p = Vec3.from(point);
  const cam = this.camera;
  const m = cam.viewProj.e;
  const x = p.x, y = p.y, z = p.z;
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  /* w is the view-space depth. At or behind the eye it is zero or
     negative and the divide is meaningless -- which is exactly the
     case a caller has to be told about rather than handed numbers
     for. */
  const behind = cw <= 1e-6;
  const iw = behind ? 1 : 1 / cw;
  const ndcX = cx * iw, ndcY = cy * iw;
  /* Against the CSS size of the canvas, not its backing-store size:
     the render scale makes those differ by up to four times, and a
     marker positioned in device pixels over a page laid out in CSS
     pixels is a marker in the wrong quarter of the screen. */
  const w = this.canvas.clientWidth || this.canvas.width;
  const h = this.canvas.clientHeight || this.canvas.height;
  return {
    x: (ndcX * 0.5 + 0.5) * w,
    y: (0.5 - ndcY * 0.5) * h,
    depth: cw,
    behind,
    /* Off the sides as well as behind, for the common "should I draw
       this at all" test. */
    offscreen: behind || ndcX < -1.15 || ndcX > 1.15 || ndcY < -1.15 || ndcY > 1.15,
  };
};

/* The field of view, in degrees, read and written.
   A mech that narrows its view to aim, a sniper scope and a sprint
   punch all want this, and all three had been reaching into
   `game.camera.fov` and remembering to convert radians themselves. */
Engine.prototype.fieldOfView = function (deg) {
  if (deg == null) return this.camera.fov * 180 / Math.PI;
  this.camera.fov = deg * Math.PI / 180;
  return deg;
};
