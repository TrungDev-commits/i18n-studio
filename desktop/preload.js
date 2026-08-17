const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('i18nStudio', {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  isDesktop: true,
});