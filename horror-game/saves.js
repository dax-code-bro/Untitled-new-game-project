/*
 * THE BIRCH — save files and settings.
 *
 * Everything lives in localStorage, which survives the browser being
 * killed, the phone being restarted, and the PWA being closed from the app
 * switcher. There is no server and there is nothing to lose to a network.
 *
 * Every save is written twice: the live copy and a backup of whatever the
 * live copy held before. A write interrupted halfway — the phone dying
 * mid-autosave — can corrupt at most the live copy, and the backup is
 * still the state from a minute ago. Loading falls back to it silently.
 *
 *   window.SAVES.list()                → [{id,name,created,played,meta}] newest first
 *   window.SAVES.create(name, snap)    → record, or null if the name is taken
 *   window.SAVES.write(id, snap)       → record
 *   window.SAVES.read(id)              → {snap, usedBackup} | null
 *   window.SAVES.rename(id, name)      → true | false if taken
 *   window.SAVES.remove(id)
 *   window.SAVES.nameTaken(name, exceptId)
 *   window.SAVES.settings() / saveSettings(obj)
 */
(function () {
  'use strict';

  var INDEX = 'birch.saves.v1';
  var SLOT = 'birch.save.v1.';
  var BAK = 'birch.bak.v1.';
  var SETTINGS = 'birch.settings.v1';

  function store() {
    try {
      var s = window.localStorage;
      s.setItem('birch.probe', '1');
      s.removeItem('birch.probe');
      return s;
    } catch (e) {
      return null;      // private mode, or storage disabled
    }
  }
  var LS = store();

  // If localStorage is unavailable the game still has to run, so fall back
  // to memory. Saves will not survive the tab, and the menu says so.
  var mem = {};
  function get(k) { return LS ? LS.getItem(k) : (mem[k] === undefined ? null : mem[k]); }
  function set(k, v) { if (LS) LS.setItem(k, v); else mem[k] = v; }
  function del(k) { if (LS) LS.removeItem(k); else delete mem[k]; }

  function parse(raw, fallback) {
    if (raw === null || raw === undefined) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function readIndex() {
    var idx = parse(get(INDEX), null);
    if (!idx || !idx.saves || !idx.saves.length) return [];
    return idx.saves;
  }
  function writeIndex(saves) {
    set(INDEX, JSON.stringify({ v: 1, saves: saves }));
  }

  function norm(name) { return String(name || '').trim().replace(/\s+/g, ' '); }
  function key(name) { return norm(name).toLowerCase(); }

  function newId() {
    // no Date.now collisions: the counter carries across calls in a tick
    newId.n = (newId.n || 0) + 1;
    return 's' + Date.now().toString(36) + newId.n.toString(36);
  }

  var api = {
    available: function () { return !!LS; },

    list: function () {
      return readIndex().slice().sort(function (a, b) { return (b.played || 0) - (a.played || 0); });
    },
    count: function () { return readIndex().length; },

    nameTaken: function (name, exceptId) {
      var k = key(name);
      return readIndex().some(function (s) { return key(s.name) === k && s.id !== exceptId; });
    },

    // A name that is not in use yet, for prefilling the box.
    suggestName: function () {
      var n = readIndex().length + 1;
      while (api.nameTaken('Night ' + n)) n++;
      return 'Night ' + n;
    },

    create: function (name, snap, meta) {
      name = norm(name);
      if (!name) return null;
      if (api.nameTaken(name)) return null;
      var now = Date.now();
      var rec = { id: newId(), name: name, created: now, played: now, meta: meta || {} };
      var saves = readIndex();
      saves.push(rec);
      writeIndex(saves);
      set(SLOT + rec.id, JSON.stringify(snap || {}));
      return rec;
    },

    // Write, keeping the previous contents as the backup. This is the
    // order that matters: back up what is already there BEFORE overwriting
    // it, so a write that dies halfway leaves one good copy behind.
    write: function (id, snap, meta) {
      var saves = readIndex();
      var rec = null;
      for (var i = 0; i < saves.length; i++) if (saves[i].id === id) rec = saves[i];
      if (!rec) return null;
      var prev = get(SLOT + id);
      if (prev !== null) {
        try { set(BAK + id, prev); } catch (e) { /* quota: the live copy matters more */ }
      }
      set(SLOT + id, JSON.stringify(snap || {}));
      rec.played = Date.now();
      if (meta) rec.meta = meta;
      writeIndex(saves);
      return rec;
    },

    read: function (id) {
      var raw = get(SLOT + id);
      var snap = parse(raw, null);
      if (snap && typeof snap === 'object') return { snap: snap, usedBackup: false };
      // the live copy is missing or was written through — fall back
      var b = parse(get(BAK + id), null);
      if (b && typeof b === 'object') return { snap: b, usedBackup: true };
      return null;
    },

    record: function (id) {
      var saves = readIndex();
      for (var i = 0; i < saves.length; i++) if (saves[i].id === id) return saves[i];
      return null;
    },

    rename: function (id, name) {
      name = norm(name);
      if (!name) return false;
      if (api.nameTaken(name, id)) return false;
      var saves = readIndex();
      for (var i = 0; i < saves.length; i++) {
        if (saves[i].id === id) { saves[i].name = name; writeIndex(saves); return true; }
      }
      return false;
    },

    remove: function (id) {
      writeIndex(readIndex().filter(function (s) { return s.id !== id; }));
      del(SLOT + id);
      del(BAK + id);
    },

    // most recently played, for the Continue button
    latest: function () {
      var l = api.list();
      return l.length ? l[0] : null;
    },

    // ---------------- settings ----------------
    DEFAULTS: {
      volMusic: 0.7, volSfx: 0.9, volCreature: 1.0, muted: false,
      sensitivity: 1.0, invertY: false,
      quality: 'high',        // high | medium | low
      shadows: true, grain: true, vignette: true, lights: 6, renderScale: 1,
      keys: null              // null = the defaults in the engine
    },
    settings: function () {
      var s = parse(get(SETTINGS), {}) || {};
      var out = {};
      Object.keys(api.DEFAULTS).forEach(function (k) {
        out[k] = (s[k] === undefined || s[k] === null) && k !== 'keys' ? api.DEFAULTS[k] : s[k];
      });
      if (out.keys === undefined) out.keys = null;
      return out;
    },
    saveSettings: function (obj) {
      set(SETTINGS, JSON.stringify(obj || {}));
      return obj;
    },

    // how much room is left, roughly, so the menu can warn before it bites
    usage: function () {
      if (!LS) return null;
      var n = 0;
      for (var i = 0; i < LS.length; i++) {
        var k = LS.key(i);
        if (k && k.indexOf('birch.') === 0) n += (LS.getItem(k) || '').length + k.length;
      }
      return n;
    }
  };

  window.SAVES = api;
})();
