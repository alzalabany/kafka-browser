/* eslint-disable @typescript-eslint/no-require-imports -- Electron main process uses CommonJS. */
const { app, BrowserWindow, Menu, Tray, nativeImage, dialog, shell, session } = require('electron');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const { mkdirSync, createWriteStream } = require('node:fs');
const path = require('node:path');

app.setName('Kafka Browser');
let window, tray, server, origin;
let quitting = false;
const smoke = process.argv.includes('--smoke-test');

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = createServer();
    socket.on('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
}

function openWindow() {
  if (window) { window.show(); window.focus(); return; }
  window = new BrowserWindow({
    width: 1440, height: 940, minWidth: 1000, minHeight: 650,
    title: 'Kafka Browser', show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  window.setMenuBarVisibility(false);
  window.once('ready-to-show', () => { if (!smoke) window.show(); });
  window.on('close', event => {
    if (!quitting && !smoke) { event.preventDefault(); window.hide(); }
  });
  window.on('closed', () => { window = null; });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault();
  });
  void window.loadURL(origin).catch(error => fail(error));
}

function createTray() {
  // A small bundled vector rendered into a native image: no remote assets.
  const pixels = Buffer.alloc(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dot = [[9,7],[23,10],[9,16],[23,23],[9,26]].some(([cx,cy]) => (x-cx)**2+(y-cy)**2 <= 12);
    const line = (x >= 8 && x <= 10 && y >= 7 && y <= 26) || (x >= 9 && x <= 23 && (Math.abs(y-(7+(x-9)*3/14)) < 1.2 || Math.abs(y-(16+(x-9)*7/14)) < 1.2));
    if (dot || line) { const i = (y*32+x)*4; pixels[i]=210; pixels[i+1]=145; pixels[i+2]=55; pixels[i+3]=255; }
  }
  tray = new Tray(nativeImage.createFromBitmap(pixels, { width:32, height:32, scaleFactor:1 }));
  tray.setToolTip('Kafka Browser — running in the background');
  const update = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Kafka Browser', click: openWindow },
    ...(app.isPackaged && ['win32','darwin'].includes(process.platform) ? [{
      label: 'Start at login', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: item => { app.setLoginItemSettings({ openAtLogin:item.checked, args:['--hidden'] }); update(); },
    }] : []),
    { label: 'Open data folder', click: () => shell.openPath(app.getPath('userData')) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
  update();
  tray.on('click', openWindow);
}

function fail(error) {
  console.error(error);
  if (!smoke) dialog.showErrorBox('Kafka Browser could not start', `${error.message}\n\nLogs and settings: ${app.getPath('userData')}`);
  app.exit(1);
}

async function start() {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const root = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', '.desktop');
  const directory = smoke ? process.env.KAFKA_BROWSER_SMOKE_DATA_DIR : app.getPath('userData');
  if (!directory) throw new Error('Smoke tests require KAFKA_BROWSER_SMOKE_DATA_DIR');
  mkdirSync(directory, { recursive:true });
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  const log = createWriteStream(path.join(directory, 'server.log'), { flags:'a' });
  const env = { ...process.env, NODE_ENV:'production', HOSTNAME:'127.0.0.1', PORT:String(port),
    KAFKA_BROWSER_DATA_DIR:directory, NEXT_TELEMETRY_DISABLED:'1' };
  delete env.NODE_OPTIONS;
  delete env.ELECTRON_RUN_AS_NODE;
  server = spawn(path.join(root, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node'), [path.join(root, 'server', 'server.js')], {
    cwd:path.join(root, 'server'), env, windowsHide:true, stdio:['ignore','pipe','pipe'],
  });
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  let exited;
  server.on('error', error => { exited = error; });
  server.on('exit', code => {
    exited = new Error(`Background server exited (${code}). See server.log.`);
    if (origin && !quitting) fail(exited);
  });
  let ready = false;
  for (let i=0; i<120; i++) {
    if (exited) throw exited;
    try { if ((await fetch(`${origin}/api/health`, { signal:AbortSignal.timeout(1000) })).ok) { ready=true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('The background server did not become healthy within 60 seconds.');
  if (smoke) {
    const response = await fetch(`${origin}/api/connections`);
    if (!response.ok) throw new Error(`SQLite check failed: ${response.status}`);
    openWindow();
    await new Promise((resolve, reject) => {
      window.webContents.once('did-finish-load', resolve);
      window.webContents.once('did-fail-load', (_event, code, description) => reject(new Error(`${code}: ${description}`)));
    });
    console.log('Desktop smoke test passed: server, SQLite, and renderer.');
    quitting = true;
    app.quit();
    return;
  }
  createTray();
  if (!process.argv.includes('--hidden') && !app.getLoginItemSettings().wasOpenedAtLogin) openWindow();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (origin) openWindow(); });
  app.on('activate', () => { if (origin) openWindow(); });
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => { quitting=true; server?.kill(); });
  app.on('will-quit', () => { server?.kill(); tray?.destroy(); });
  // Also covers startup failures that exit without the normal quit sequence.
  process.on('exit', () => server?.kill());
  app.whenReady().then(start).catch(fail);
}
