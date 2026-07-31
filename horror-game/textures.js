/*
 * Untitled Horror Game — procedural surfaces.
 *
 * Every texture in the game is drawn to a canvas at load. Nothing is
 * fetched, so the single-file build stays self-contained.
 *
 *   window.TEX.concrete(...)  → THREE.CanvasTexture
 */
(function () {
  'use strict';

  function canvas(size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  }

  function finish(THREE, c, repeat) {
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    return t;
  }

  // Value-noise blotching used as the base of most rough surfaces.
  function blotch(x, size, base, octaves) {
    for (var o = 0; o < octaves.length; o++) {
      var cells = octaves[o][0], amp = octaves[o][1], al = octaves[o][2];
      var step = size / cells;
      for (var yy = 0; yy < cells; yy++) {
        for (var xx = 0; xx < cells; xx++) {
          var v = Math.max(0, Math.min(255, base + (Math.random() * 2 - 1) * amp));
          x.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + al + ')';
          x.fillRect(xx * step, yy * step, step + 1, step + 1);
        }
      }
    }
  }

  function grime(x, size, amount, alpha) {
    for (var i = 0; i < amount; i++) {
      var gx = Math.random() * size, gy = Math.random() * size;
      var r = 8 + Math.random() * 46;
      var g = x.createRadialGradient(gx, gy, 0, gx, gy, r);
      g.addColorStop(0, 'rgba(28,24,18,' + (alpha || 0.09) + ')');
      g.addColorStop(1, 'rgba(28,24,18,0)');
      x.fillStyle = g;
      x.beginPath(); x.arc(gx, gy, r, 0, Math.PI * 2); x.fill();
    }
  }

  var TEX = {};

  // ---------------- Concrete ----------------
  TEX.concrete = function (THREE, size, base, opts) {
    opts = opts || {};
    var c = canvas(size), x = c.getContext('2d');
    x.fillStyle = 'rgb(' + base + ',' + base + ',' + base + ')';
    x.fillRect(0, 0, size, size);
    blotch(x, size, base, [[6, 15, 0.5], [16, 11, 0.4], [48, 8, 0.35], [128, 5, 0.3]]);

    // aggregate and pitting
    for (var s = 0; s < (opts.speckle || 2400); s++) {
      var v = Math.max(0, Math.min(255, base + (Math.random() < 0.6 ? -36 : 28)));
      x.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (Math.random() * 0.5 + 0.2) + ')';
      x.beginPath();
      x.arc(Math.random() * size, Math.random() * size, Math.random() * 1.7 + 0.2, 0, Math.PI * 2);
      x.fill();
    }
    // form-tie holes and pour lines
    if (opts.formwork) {
      x.strokeStyle = 'rgba(0,0,0,0.10)'; x.lineWidth = 2;
      for (var f = 1; f < 3; f++) {
        x.beginPath(); x.moveTo(0, (size / 3) * f); x.lineTo(size, (size / 3) * f + (Math.random() - 0.5) * 6); x.stroke();
      }
      for (var t = 0; t < 4; t++) {
        var tx = size * (0.2 + Math.random() * 0.6), ty = size * (0.2 + Math.random() * 0.6);
        x.fillStyle = 'rgba(0,0,0,0.16)';
        x.beginPath(); x.arc(tx, ty, 3.5, 0, Math.PI * 2); x.fill();
      }
    }
    // hairline cracks
    for (var k = 0; k < (opts.cracks || 3); k++) {
      x.strokeStyle = 'rgba(0,0,0,0.22)';
      x.lineWidth = 0.8 + Math.random();
      x.beginPath();
      var cx = Math.random() * size, cy = Math.random() * size;
      x.moveTo(cx, cy);
      for (var seg = 0; seg < 7; seg++) {
        cx += (Math.random() - 0.5) * 44; cy += (Math.random() - 0.5) * 44;
        x.lineTo(cx, cy);
      }
      x.stroke();
    }
    grime(x, size, opts.grime === undefined ? 5 : opts.grime, 0.07);
    return finish(THREE, c, opts.repeat);
  };

  // ---------------- Wood ----------------
  // Used for the corridor doors, the counter and the office.
  TEX.wood = function (THREE, size, tone, opts) {
    opts = opts || {};
    var c = canvas(size), x = c.getContext('2d');
    var base = tone || [122, 92, 58];
    x.fillStyle = 'rgb(' + base[0] + ',' + base[1] + ',' + base[2] + ')';
    x.fillRect(0, 0, size, size);

    // grain: long bands with fine fibre inside them
    var y = 0;
    while (y < size) {
      var bandH = 4 + Math.random() * 16;
      var d = (Math.random() - 0.45) * 34;
      x.fillStyle = 'rgba(' + Math.max(0, base[0] + d) + ',' + Math.max(0, base[1] + d * 0.85) + ',' + Math.max(0, base[2] + d * 0.7) + ',0.55)';
      x.fillRect(0, y, size, bandH);
      for (var f = 0; f < bandH * 1.6; f++) {
        var fy = y + Math.random() * bandH;
        x.strokeStyle = 'rgba(' + Math.max(0, base[0] - 30) + ',' + Math.max(0, base[1] - 26) + ',' + Math.max(0, base[2] - 20) + ',' + (Math.random() * 0.16) + ')';
        x.lineWidth = 0.7;
        x.beginPath();
        x.moveTo(0, fy);
        for (var sx = 0; sx <= size; sx += 32) x.lineTo(sx, fy + Math.sin(sx * 0.02 + y) * 1.6);
        x.stroke();
      }
      y += bandH;
    }
    // knots
    for (var k = 0; k < (opts.knots === undefined ? 2 : opts.knots); k++) {
      var kx = Math.random() * size, ky = Math.random() * size;
      for (var r = 16; r > 0; r -= 2.2) {
        x.strokeStyle = 'rgba(' + Math.max(0, base[0] - 46) + ',' + Math.max(0, base[1] - 40) + ',' + Math.max(0, base[2] - 30) + ',' + (0.14 + (16 - r) * 0.02) + ')';
        x.lineWidth = 1.4;
        x.beginPath();
        x.ellipse(kx, ky, r, r * 0.62, 0.4, 0, Math.PI * 2);
        x.stroke();
      }
    }
    grime(x, size, opts.grime === undefined ? 4 : opts.grime, 0.08);
    return finish(THREE, c, opts.repeat);
  };

  // ---------------- Metal ----------------
  TEX.metal = function (THREE, size, base, opts) {
    opts = opts || {};
    var c = canvas(size), x = c.getContext('2d');
    x.fillStyle = 'rgb(' + base + ',' + base + ',' + base + ')';
    x.fillRect(0, 0, size, size);
    blotch(x, size, base, [[8, 9, 0.35], [32, 6, 0.3]]);

    // brushed scratches
    for (var s = 0; s < 420; s++) {
      var sy = Math.random() * size;
      var len = 20 + Math.random() * 180;
      var sx = Math.random() * size;
      x.strokeStyle = 'rgba(' + (Math.random() < 0.5 ? 255 : 0) + ',' + (Math.random() < 0.5 ? 255 : 0) + ',255,' + (Math.random() * 0.05) + ')';
      x.lineWidth = 0.6 + Math.random() * 0.8;
      x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + len, sy + (Math.random() - 0.5) * 3); x.stroke();
    }
    // rust blooms
    for (var r = 0; r < (opts.rust || 6); r++) {
      var rx = Math.random() * size, ry = Math.random() * size, rr = 6 + Math.random() * 30;
      var g = x.createRadialGradient(rx, ry, 0, rx, ry, rr);
      g.addColorStop(0, 'rgba(112,58,26,0.42)');
      g.addColorStop(0.6, 'rgba(96,52,26,0.22)');
      g.addColorStop(1, 'rgba(96,52,26,0)');
      x.fillStyle = g;
      x.beginPath(); x.arc(rx, ry, rr, 0, Math.PI * 2); x.fill();
    }
    if (opts.plate) {
      x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 3;
      x.strokeRect(2, 2, size - 4, size - 4);
      for (var b = 0; b < 8; b++) {
        var bx = 14 + (b % 4) * (size / 4), by = 14 + Math.floor(b / 4) * (size - 28);
        x.fillStyle = 'rgba(255,255,255,0.10)';
        x.beginPath(); x.arc(bx, by, 3.4, 0, Math.PI * 2); x.fill();
        x.fillStyle = 'rgba(0,0,0,0.35)';
        x.beginPath(); x.arc(bx, by + 1.2, 2.2, 0, Math.PI * 2); x.fill();
      }
    }
    return finish(THREE, c, opts.repeat);
  };

  // ---------------- Tile ----------------
  TEX.tile = function (THREE, size, opts) {
    opts = opts || {};
    var c = canvas(size), x = c.getContext('2d');
    var n = opts.cells || 8, step = size / n;
    x.fillStyle = opts.grout || '#5e6362';
    x.fillRect(0, 0, size, size);
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        var v = 178 + (Math.random() - 0.5) * 16;
        x.fillStyle = 'rgb(' + v + ',' + (v + 2) + ',' + (v + 1) + ')';
        x.fillRect(i * step + 2, j * step + 2, step - 4, step - 4);
        // a few cracked or missing tiles
        if (Math.random() < 0.05) {
          x.strokeStyle = 'rgba(40,44,44,0.6)'; x.lineWidth = 1.2;
          x.beginPath();
          x.moveTo(i * step + 2, j * step + Math.random() * step);
          x.lineTo(i * step + step - 2, j * step + Math.random() * step);
          x.stroke();
        }
      }
    }
    // grime settles into the grout lines
    for (var g = 0; g <= n; g++) {
      x.strokeStyle = 'rgba(28,26,20,0.22)';
      x.lineWidth = 3;
      x.beginPath(); x.moveTo(g * step, 0); x.lineTo(g * step, size); x.stroke();
      x.beginPath(); x.moveTo(0, g * step); x.lineTo(size, g * step); x.stroke();
    }
    grime(x, size, opts.grime === undefined ? 10 : opts.grime, 0.10);
    return finish(THREE, c, opts.repeat);
  };

  // ---------------- Carpet ----------------
  TEX.carpet = function (THREE, size, tone, opts) {
    opts = opts || {};
    var c = canvas(size), x = c.getContext('2d');
    var base = tone || [78, 84, 92];
    x.fillStyle = 'rgb(' + base[0] + ',' + base[1] + ',' + base[2] + ')';
    x.fillRect(0, 0, size, size);
    // loop pile: dense short strokes
    for (var i = 0; i < size * 34; i++) {
      var d = (Math.random() - 0.5) * 40;
      x.strokeStyle = 'rgba(' + Math.max(0, base[0] + d) + ',' + Math.max(0, base[1] + d) + ',' + Math.max(0, base[2] + d) + ',0.5)';
      x.lineWidth = 0.8;
      var px = Math.random() * size, py = Math.random() * size;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + (Math.random() - 0.5) * 3, py + (Math.random() - 0.5) * 3); x.stroke();
    }
    // contract-carpet fleck
    for (var f = 0; f < 500; f++) {
      x.fillStyle = Math.random() < 0.5 ? 'rgba(160,150,120,0.16)' : 'rgba(20,22,26,0.28)';
      x.fillRect(Math.random() * size, Math.random() * size, 1.6, 1.6);
    }
    grime(x, size, opts.grime === undefined ? 8 : opts.grime, 0.11);
    return finish(THREE, c, opts.repeat);
  };

  // ---------------- Wired safety glass ----------------
  TEX.wiredGlass = function (THREE, size) {
    var c = canvas(size), x = c.getContext('2d');
    x.fillStyle = 'rgba(150,175,180,0.30)';
    x.fillRect(0, 0, size, size);
    x.strokeStyle = 'rgba(60,66,66,0.55)';
    x.lineWidth = 1.4;
    var step = size / 12;
    for (var i = 0; i <= 12; i++) {
      x.beginPath(); x.moveTo(i * step, 0); x.lineTo(i * step, size); x.stroke();
      x.beginPath(); x.moveTo(0, i * step); x.lineTo(size, i * step); x.stroke();
    }
    grime(x, size, 6, 0.14);
    return finish(THREE, c);
  };

  // ---------------- Signage ----------------
  TEX.sign = function (THREE, text, opts) {
    opts = opts || {};
    var c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    var x = c.getContext('2d');
    x.fillStyle = opts.bg || '#2b2f31';
    x.fillRect(0, 0, 256, 128);
    x.strokeStyle = opts.border || 'rgba(200,205,205,0.35)';
    x.lineWidth = 3;
    x.strokeRect(7, 7, 242, 114);
    x.fillStyle = opts.fg || '#cfd4d2';
    x.font = 'bold ' + (opts.fontSize || 34) + 'px monospace';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    var lines = text.split('\n');
    lines.forEach(function (line, i) {
      x.fillText(line, 128, 64 + (i - (lines.length - 1) / 2) * (opts.fontSize || 34) * 1.15);
    });
    // scuffing
    for (var s = 0; s < 40; s++) {
      x.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.14) + ')';
      x.fillRect(Math.random() * 256, Math.random() * 128, Math.random() * 20, 1.5);
    }
    var t = new THREE.CanvasTexture(c);
    t.anisotropy = 8;
    return t;
  };

  // Hazard stripes, for the airlock hatches.
  TEX.hazard = function (THREE, size) {
    var c = canvas(size), x = c.getContext('2d');
    x.fillStyle = '#c9a227'; x.fillRect(0, 0, size, size);
    x.fillStyle = '#1b1b1c';
    var w = size / 6;
    for (var i = -6; i < 12; i++) {
      x.save();
      x.beginPath();
      x.moveTo(i * w, 0); x.lineTo(i * w + w / 2, 0);
      x.lineTo(i * w + w / 2 + size, size); x.lineTo(i * w + size, size);
      x.closePath(); x.fill();
      x.restore();
    }
    for (var s = 0; s < 260; s++) {
      x.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.2) + ')';
      x.fillRect(Math.random() * size, Math.random() * size, Math.random() * 14, 2);
    }
    grime(x, size, 8, 0.16);
    return finish(THREE, c);
  };

  // ---------------- Wall clock, stopped ----------------
  TEX.clock = function (THREE) {
    var c = document.createElement('canvas');
    c.width = c.height = 256;
    var x = c.getContext('2d');
    x.fillStyle = '#26292b'; x.fillRect(0, 0, 256, 256);
    x.fillStyle = '#d8d6cc';
    x.beginPath(); x.arc(128, 128, 112, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#2a2d2f'; x.lineWidth = 8;
    x.beginPath(); x.arc(128, 128, 112, 0, Math.PI * 2); x.stroke();
    for (var i = 0; i < 12; i++) {
      var a = i * Math.PI / 6;
      x.strokeStyle = '#3a3d3f';
      x.lineWidth = i % 3 === 0 ? 6 : 3;
      x.beginPath();
      x.moveTo(128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96);
      x.lineTo(128 + Math.cos(a) * 106, 128 + Math.sin(a) * 106);
      x.stroke();
    }
    // hands frozen where the power died
    x.strokeStyle = '#1d1f21'; x.lineCap = 'round';
    x.lineWidth = 7;
    x.beginPath(); x.moveTo(128, 128); x.lineTo(180, 114); x.stroke();
    x.lineWidth = 5;
    x.beginPath(); x.moveTo(128, 128); x.lineTo(148, 210); x.stroke();
    x.strokeStyle = '#7e3529'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(128, 128); x.lineTo(58, 88); x.stroke();
    for (var g = 0; g < 30; g++) {
      x.fillStyle = 'rgba(30,26,20,' + Math.random() * 0.08 + ')';
      x.fillRect(Math.random() * 256, Math.random() * 256, 20, 2);
    }
    var t = new THREE.CanvasTexture(c);
    t.anisotropy = 8;
    return t;
  };

  // ---------------- Tally marks scratched into paint ----------------
  TEX.tally = function (THREE, count) {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 160;
    var x = c.getContext('2d');
    x.fillStyle = '#4a4e50'; x.fillRect(0, 0, 256, 160);
    grime(x, 256, 6, 0.12);
    x.strokeStyle = 'rgba(224,218,200,0.8)';
    x.lineWidth = 3; x.lineCap = 'round';
    var n = count || 23;
    for (var i = 0; i < n; i++) {
      var group = Math.floor(i / 5), inGroup = i % 5;
      var bx = 24 + (group % 4) * 56, by = 34 + Math.floor(group / 4) * 58;
      x.beginPath();
      if (inGroup < 4) {
        var lx = bx + inGroup * 10 + (Math.random() - 0.5) * 2;
        x.moveTo(lx, by + (Math.random() - 0.5) * 3);
        x.lineTo(lx + 2, by + 34 + (Math.random() - 0.5) * 3);
      } else {
        x.moveTo(bx - 4, by + 28); x.lineTo(bx + 36, by + 6);
      }
      x.stroke();
    }
    var t = new THREE.CanvasTexture(c);
    t.anisotropy = 8;
    return t;
  };

  window.TEX = TEX;
})();
