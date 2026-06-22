const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dir = __dirname;
const electronDist = path.join(dir, 'node_modules', 'electron', 'dist');
const outDir = path.join(dir, 'dist', 'BeeData');

console.log('1. Clearing output...');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

console.log('2. Copying electron dist files...');
const files = fs.readdirSync(electronDist);
for (const f of files) {
  const src = path.join(electronDist, f);
  const dest = path.join(outDir, f);
  if (fs.statSync(src).isFile()) {
    fs.copyFileSync(src, dest);
  }
}
// Rename electron.exe to BeeData.exe
const oldExe = path.join(outDir, 'electron.exe');
const newExe = path.join(outDir, 'BeeData.exe');
if (fs.existsSync(oldExe)) {
  fs.renameSync(oldExe, newExe);
}
console.log('   electron.exe -> BeeData.exe');

console.log('3. Creating resources/app...');
const appDir = path.join(outDir, 'resources', 'app');
fs.mkdirSync(appDir, { recursive: true });

['main.js','preload.js','updater.js','version.json','package.json'].forEach(f => {
  fs.copyFileSync(path.join(dir, f), path.join(appDir, f));
});

copyDir(path.join(dir, 'renderer'), path.join(appDir, 'renderer'), []);
copyDir(path.join(dir, 'assets'), path.join(appDir, 'assets'), []);

console.log('4. Copying node_modules (skip electron)...');
const nmSrc = path.join(dir, 'node_modules');
const nmDest = path.join(appDir, 'node_modules');
copyDir(nmSrc, nmDest, ['electron', 'electron-builder']);

console.log('\nDONE: ' + newExe);
console.log('Size: ' + (fs.statSync(newExe).size / 1024 / 1024).toFixed(0) + ' MB');

function copyDir(src, dest, exclude) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (exclude.includes(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d, exclude);
    else fs.copyFileSync(s, d);
  }
}