const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dir = __dirname;
const electronDist = path.join(dir, 'node_modules', 'electron', 'dist');
const outDir = path.join(dir, 'dist', 'BeeData');

console.log('1. Clear output...');
try { fs.rmSync(outDir, { recursive: true, force: true }); } catch {}
fs.mkdirSync(outDir, { recursive: true });

console.log('2. Copy electron dist files...');
for (const entry of fs.readdirSync(electronDist, { withFileTypes: true })) {
  const src = path.join(electronDist, entry.name);
  const dest = path.join(outDir, entry.name);
  if (entry.isFile()) {
    fs.copyFileSync(src, dest);
  } else if (entry.isDirectory() && entry.name !== 'resources') {
    copyDirRecursive(src, dest);
  }
}
// Rename electron.exe to BeeData.exe
fs.renameSync(path.join(outDir, 'electron.exe'), path.join(outDir, 'BeeData.exe'));
console.log('   electron.exe -> BeeData.exe');

console.log('3. Create resources/app...');
const appDir = path.join(outDir, 'resources', 'app');
fs.mkdirSync(appDir, { recursive: true });

// 复制根目录的 app 文件
['main.js','preload.js','updater.js','version.json','package.json'].forEach(f => {
  fs.copyFileSync(path.join(dir, f), path.join(appDir, f));
});

// 复制 renderer 目录
copyDir(path.join(dir, 'renderer'), path.join(appDir, 'renderer'), []);
// 复制 assets 目录
copyDir(path.join(dir, 'assets'), path.join(appDir, 'assets'), []);

console.log('4. Copy node_modules...');
const nmSrc = path.join(dir, 'node_modules');
const nmDest = path.join(appDir, 'node_modules');
copyDir(nmSrc, nmDest, ['electron', 'electron-builder', '@electron', '@electron-internal', 'app-builder-lib', 'builder-util', 'dmg-builder', 'nexe', 'pkg', '.bin', '.package-lock.json']);

console.log('5. Verify...');
const exe = path.join(outDir, 'BeeData.exe');
const dll = path.join(outDir, 'ffmpeg.dll');
console.log('   BeeData.exe:', fs.existsSync(exe) ? 'OK' : 'MISSING');
console.log('   ffmpeg.dll:', fs.existsSync(dll) ? 'OK' : 'MISSING');
console.log('   resources/app/main.js:', fs.existsSync(path.join(appDir, 'main.js')) ? 'OK' : 'MISSING');
console.log('\nBUILD COMPLETE: ' + outDir);

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

function copyDir(src, dest, exclude) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (exclude.includes(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d, exclude);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}