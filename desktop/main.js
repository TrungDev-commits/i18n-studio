const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { startServer } = require('i18n-studio-server');

const DEV_URL = process.env.I18N_DEV_URL || 'http://localhost:3000';
const isDev = process.argv.includes('--dev');

let mainWindow = null;
let apiServer = null;
let appUrl = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f172a',
    show: false,
    autoHideMenuBar: true,
    title: 'i18n Translation Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(appUrl);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: 'Thoát' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom', label: 'Zoom thực' },
        { role: 'zoomIn', label: 'Phóng to' },
        { role: 'zoomOut', label: 'Thu nhỏ' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toàn màn hình' },
        { role: 'toggleDevTools', label: 'Công cụ phát triển' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About i18n Studio',
          click: () => {
            shell.openExternal('https://github.com/anomalyco/opencode');
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  try {
    apiServer = await startServer({ port: 4000 });
  } catch (err) {
    console.error('❌ Không thể khởi động server nội bộ:', err.message);
  }

  appUrl = isDev ? DEV_URL : `http://localhost:${apiServer ? apiServer.address().port : 4000}`;
  createWindow();
  buildMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (apiServer) apiServer.close();
});