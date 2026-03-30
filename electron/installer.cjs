const path = require('path');
const { createWindowsInstaller } = require('electron-winstaller');

const root = path.join(__dirname, '..');
const appDirectory = path.join(root, 'release-builds2', 'Duelverse-win32-x64');
const outputDirectory = path.join(root, 'release-builds2', 'installer');

console.log('Creating Windows installer from:', appDirectory);

createWindowsInstaller({
  appDirectory,
  outputDirectory,
  authors: 'Duelverse',
  exe: 'Duelverse.exe',
  setupExe: 'DuelverseSetup.exe',
  setupIcon: path.join(__dirname, 'icon.ico'),
  noMsi: false,
  name: 'Duelverse',
})
  .then(() => {
    console.log('Windows installer created successfully in:', outputDirectory);
  })
  .catch((e) => {
    console.error('Unable to create Windows installer:', e.message || e);
    process.exit(1);
  });
