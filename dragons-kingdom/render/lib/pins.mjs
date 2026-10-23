// Versions every computer must use, in one place (pc/setup-windows.ps1 and pc/setup.sh install exactly these;
// test/pc-kit.test.mjs checks that they agree). The landscape bakes and the renders run on this Node.js.
export const PINS = {
  node: '22.22.0',
};
