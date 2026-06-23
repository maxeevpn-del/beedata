const fs = require('fs');
const path = require('path');

const dir = __dirname;
const appDir = path.join(dir, 'dist', 'BeeData', 'resources', 'app');

if (!fs.existsSync(appDir)) {
  console.log('棣栨鏋勫缓闇€鍏堣繍琛?node _build.js');
  process.exit(1);
}

console.log('澶嶅埗浠ｇ爜鏂囦欢...');

// 婧愭枃浠?['main.js', 'preload.js', 'updater.js', 'version.json', 'package.json'].forEach(f => {
  fs.copyFileSync(path.join(dir, f), path.join(appDir, f));
});

// renderer 鐩綍
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
copyDir(path.join(dir, 'renderer'), path.join(appDir, 'renderer'));

// assets 鐩綍
copyDir(path.join(dir, 'assets'), path.join(appDir, 'assets'));

console.log('瀹屾垚锛堜粎浠ｇ爜锛屼笉鍚?node_modules锛?);
