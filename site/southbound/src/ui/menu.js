// Start screen (platform + GPU selection) and the settings panel.
import { GPU_CHOICES, PRESETS, detectGPU, saveSettings } from '../settings.js';

const $ = (s) => document.querySelector(s);

export function setupMenu(settings, onPlay) {
  const gpu = detectGPU();
  const sel = $('#gpu');
  for (const c of GPU_CHOICES) {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.label;
    sel.appendChild(o);
  }
  $('#detected').textContent = `Detected: ${gpu.name} → recommended ${PRESETS[gpu.preset].label}`;
  const presetsEl = $('#presets');
  for (const k of ['low', 'medium', 'high', 'ultra', 'cinematic']) {
    const b = document.createElement('button');
    b.textContent = PRESETS[k].label; b.dataset.preset = k;
    b.onclick = () => { settings.preset = k; refresh(); };
    presetsEl.appendChild(b);
  }
  const refresh = () => {
    presetsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.preset === settings.preset));
    document.querySelectorAll('[data-platform]').forEach((b) => b.classList.toggle('sel', b.dataset.platform === settings.platform));
    $('#step-pc').classList.toggle('show', settings.platform === 'pc');
    $('#step-phone').classList.toggle('show', settings.platform === 'phone');
    $('#step-platform').classList.toggle('show', !settings.platform);
    $('#back').style.display = settings.platform ? '' : 'none';
    $('#play').disabled = !settings.platform;
    $('#newgame').disabled = !settings.platform;
  };
  sel.value = settings.gpuChoice;
  sel.onchange = () => {
    settings.gpuChoice = sel.value;
    const c = GPU_CHOICES.find((g) => g.id === sel.value);
    settings.preset = c.preset || (gpu.preset === 'phone' ? 'low' : gpu.preset);
    refresh();
  };
  $('#res').value = settings.resolution;
  $('#res').onchange = (e) => { settings.resolution = e.target.value; };
  $('#targetfps').value = String(settings.targetFps);
  $('#targetfps').onchange = (e) => { settings.targetFps = +e.target.value; };
  document.querySelectorAll('[data-platform]').forEach((b) => {
    b.onclick = () => {
      settings.platform = b.dataset.platform;
      if (settings.platform === 'phone') { settings.preset = 'phone'; settings.targetFps = 60; settings.resolution = 'native'; }
      else {
        if (settings.preset === 'phone') settings.preset = gpu.preset === 'phone' ? 'low' : gpu.preset;
        if (settings.gpuChoice !== 'auto') settings.preset = GPU_CHOICES.find((g) => g.id === settings.gpuChoice)?.preset || settings.preset;
        if (settings.targetFps < 60) settings.targetFps = 60;
        $('#targetfps').value = String(settings.targetFps);
      }
      refresh();
    };
  });
  $('#back').onclick = () => { settings.platform = null; refresh(); };
  $('#play').onclick = () => { saveSettings(settings); onPlay(); };
  // start over: arrive in Calvera with nothing again
  let hasSave = false;
  try { hasSave = !!localStorage.getItem('southbound.save.v1'); } catch (e) { /* storage blocked */ }
  if (hasSave) {
    $('#play').textContent = 'Continue';
    const ng = $('#newgame'); ng.style.display = '';
    ng.onclick = () => {
      if (!confirm('Start a new game? Your saved progress, money, guns, cars and houses will be erased. You start with nothing.')) return;
      try { localStorage.removeItem('southbound.save.v1'); } catch (e) { /* */ }
      saveSettings(settings); onPlay();
    };
  }
  // the desktop app is always a PC
  if (window.SB_DESKTOP && !settings.platform) { settings.platform = 'pc'; settings.preset = gpu.preset === 'phone' ? 'high' : gpu.preset; settings.dynamicRes = true; }
  if (!settings.platform) {
    // first launch: pre-pick a sensible default from the detection
    if (gpu.mobile) settings.preset = 'phone';
    else settings.preset = gpu.preset === 'phone' ? 'low' : gpu.preset;
  }
  refresh();
  return gpu;
}

// ---------------------------------------------------------------- settings panel
const SCHEMA = {
  Graphics: [
    { key: 'preset', label: 'Quality preset', type: 'select', options: Object.keys(PRESETS).map((k) => [k, PRESETS[k].label]), restart: true },
    { key: 'resolution', label: 'Resolution', type: 'select', options: [['native', 'Native'], ['2160', '4K (2160p)'], ['1440', '1440p'], ['1080', '1080p'], ['720', '720p']] },
    { key: 'dynamicRes', label: 'Dynamic resolution', hint: 'Holds your target FPS', type: 'toggle' },
    { key: 'targetFps', label: 'Target FPS', type: 'select', options: [[30, '30'], [60, '60'], [90, '90'], [100, '100'], [120, '120'], [144, '144']] },
    { key: 'shadows', label: 'Shadows', type: 'select', options: [[null, 'Preset'], [0, 'Off'], [1, 'Low'], [2, 'Medium'], [3, 'High']], restart: true },
    { key: 'bloom', label: 'Bloom / glow', type: 'select', options: [[null, 'Preset'], [true, 'On'], [false, 'Off']], restart: true },
    { key: 'ao', label: 'Ambient occlusion', type: 'select', options: [[null, 'Preset'], [true, 'On'], [false, 'Off']], restart: true },
    { key: 'aa', label: 'Anti-aliasing', type: 'select', options: [[null, 'Preset'], ['smaa', 'SMAA'], ['msaa', 'MSAA'], ['off', 'Off']], restart: true },
    { key: 'grass', label: 'Grass & flowers', type: 'select', options: [[null, 'On'], [false, 'Off']], restart: true },
    { key: 'treeDensity', label: 'Tree density', type: 'range', min: 0.25, max: 1.5, step: 0.05, restart: true },
    { key: 'drawDistance', label: 'Draw distance', type: 'range', min: 0.5, max: 1.5, step: 0.05 },
    { key: 'trafficDensity', label: 'Traffic density', type: 'range', min: 0, max: 2, step: 0.1 },
    { key: 'fov', label: 'Field of view', type: 'range', min: 55, max: 100, step: 1 },
  ],
  Controls: [
    { key: 'sensitivity', label: 'Look sensitivity', type: 'range', min: 0.2, max: 3, step: 0.05 },
    { key: 'invertY', label: 'Invert look Y', type: 'toggle' },
  ],
  Audio: [
    { key: 'masterVolume', label: 'Master volume', type: 'range', min: 0, max: 1, step: 0.05 },
    { key: 'sfxVolume', label: 'Effects', type: 'range', min: 0, max: 1, step: 0.05 },
    { key: 'ambienceVolume', label: 'Ambience', type: 'range', min: 0, max: 1, step: 0.05 },
  ],
  Content: [
    { key: 'gore', label: 'Blood & gore', hint: 'Off = family-friendly hits', type: 'toggle' },
    { key: 'strongLanguage', label: 'Strong language', hint: 'Off = bleeped dialogue', type: 'toggle' },
    { key: 'subtitles', label: 'Subtitles', type: 'toggle' },
  ],
  Display: [
    { key: 'units', label: 'Speed units', type: 'select', options: [['mph', 'MPH'], ['kmh', 'KM/H']] },
    { key: 'showFps', label: 'Show FPS counter', type: 'toggle' },
    { key: 'hudScale', label: 'HUD size', type: 'range', min: 0.7, max: 1.5, step: 0.05 },
    { key: 'timeScale', label: 'Day speed', hint: '1 = a game day lasts 48 minutes', type: 'range', min: 0, max: 10, step: 0.25 },
  ],
};

export function setupSettingsPanel(settings, onChange) {
  const tabs = $('#tabs'), body = $('#setbody');
  let current = 'Graphics';
  let needsRestart = false;
  const render = () => {
    tabs.innerHTML = '';
    for (const t of Object.keys(SCHEMA)) {
      const b = document.createElement('button');
      b.textContent = t; b.className = t === current ? 'sel' : '';
      b.onclick = () => { current = t; render(); };
      tabs.appendChild(b);
    }
    body.innerHTML = '';
    for (const it of SCHEMA[current]) {
      const row = document.createElement('div');
      row.className = 'srow';
      row.innerHTML = `<div>${it.label}${it.restart ? ' <small>applies on restart</small>' : ''}${it.hint ? `<small>${it.hint}</small>` : ''}</div><div class="val"></div>`;
      const val = row.querySelector('.val');
      const set = (v) => {
        settings[it.key] = v; saveSettings(settings);
        if (it.restart) { needsRestart = true; $('#restart').style.display = window.__sbRunning ? '' : 'none'; }
        onChange(it.key);
      };
      if (it.type === 'select') {
        const s = document.createElement('select');
        it.options.forEach(([v, l], i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = l; if (v === settings[it.key]) o.selected = true; s.appendChild(o); });
        s.onchange = () => set(it.options[+s.value][0]);
        val.appendChild(s);
      } else if (it.type === 'toggle') {
        const b = document.createElement('button');
        b.className = 'toggle' + (settings[it.key] ? ' on' : '');
        b.onclick = () => { set(!settings[it.key]); b.classList.toggle('on', settings[it.key]); };
        val.appendChild(b);
      } else {
        const r = document.createElement('input');
        r.type = 'range'; r.min = it.min; r.max = it.max; r.step = it.step; r.value = settings[it.key];
        const o = document.createElement('output'); o.textContent = (+settings[it.key]).toFixed(2).replace(/\.00$/, '');
        r.oninput = () => { o.textContent = (+r.value).toFixed(2).replace(/\.00$/, ''); set(+r.value); };
        val.append(r, o);
      }
      body.appendChild(row);
    }
    $('#restart-note').textContent = needsRestart && window.__sbRunning ? 'Some changes apply after restarting the world.' : 'Settings save automatically.';
  };
  $('#restart').onclick = () => { location.reload(); };
  return {
    open() { render(); $('#settings').classList.add('show'); },
    close() { $('#settings').classList.remove('show'); },
  };
}
