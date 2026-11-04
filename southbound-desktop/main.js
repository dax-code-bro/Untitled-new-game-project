// Southbound for Windows / macOS / Linux: a native desktop window that runs the
// game from disk. No browser tabs, address bar or tab throttling; the fastest
// GPU in the machine is used and the GPU blocklist is ignored, and the game
// starts on its top quality preset when the card can take it.
const { app, BrowserWindow, protocol, net, shell, Menu } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// the discrete GPU, always; never slow the game down when the window loses focus
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// the game is served from the install folder through a private app:// scheme
// (fetching models and textures from file:// isn't allowed)
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const ROOT = path.join(__dirname, 'game');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 540,
    backgroundColor: '#000000', title: 'Southbound', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'game', 'assets', 'icons', 'icon-512.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadURL('app://southbound/index.html');
  if (SMOKE) win.webContents.once('did-finish-load', () => smoke(win));
  win.webContents.on('console-message', (e, level, msg) => { if (SMOKE && level >= 2) console.log('[game] ' + msg.slice(0, 300)); });
  // F11: fullscreen; links open in the real browser
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); shell.openExternal(url); } });
}

// smoke test (CI): start the game, wait until the world is loaded, save a screenshot, quit
const SMOKE = !!process.env.SOUTHBOUND_SMOKE;
if (SMOKE) app.commandLine.appendSwitch('enable-unsafe-swiftshader');
async function smoke(win) {
  const wc = win.webContents, js = (c) => wc.executeJavaScript(c, true);
  const until = async (cond, secs) => { for (let i = 0; i < secs; i++) { if (await js(cond).catch(() => false)) return true; await new Promise((r) => setTimeout(r, 1000)); } return false; };
  const fail = async (why) => { console.log('SMOKE FAIL: ' + why + ' ' + (await js("(document.getElementById('loaderror')||{}).textContent||''").catch(() => ''))); app.exit(1); };
  if (!(await until('!!window.__sbReady && !!window.SB_DESKTOP', 60))) return fail('the start screen did not come up');
  console.log('SMOKE: start screen up, desktop flag seen');
  await js("document.getElementById('play').click()");
  if (!(await until('!!(window.SB && window.SB.state)', 900))) return fail('the world did not load');
  await new Promise((r) => setTimeout(r, 8000));
  const st = await js('JSON.stringify(window.SB.state)');
  console.log('SMOKE: world loaded ' + st);
  const img = await wc.capturePage();
  require('fs').mkdirSync(path.join(__dirname, 'smoke'), { recursive: true });
  require('fs').writeFileSync(path.join(process.env.SOUTHBOUND_SMOKE_OUT || path.join(__dirname, 'smoke'), 'smoke.png'), img.toPNG());
  console.log('SMOKE OK');
  app.exit(0);
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    if (p === '/' || p === '') p = '/index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
