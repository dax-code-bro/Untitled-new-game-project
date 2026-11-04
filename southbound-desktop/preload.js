// Tells the game it is running as the desktop app (it then skips the phone/PC
// question and starts on the preset the graphics card can take).
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('SB_DESKTOP', { platform: process.platform, electron: process.versions.electron, chrome: process.versions.chrome });
