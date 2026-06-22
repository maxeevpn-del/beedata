const fs = require('fs');
const path = require('path');

const dir = __dirname;
const appDir = path.join(dir, 'dist', 'BeeData', 'resources', 'app');

if (!fs.existsSync(appDir)) {
  console.log('首次构建需先运行 node _build.js');
  process.exit(1);
}

console.log('复制代码文件...');

// 源文件
['main.js', 'preload.js', 'updater.js', 'version.json', 'package.json'].forEach(f => {
  fs.copyFileSync(path.join(dir, f), path.join(appDir, f));
});

// renderer 目录
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

// assets 目录
copyDir(path.join(dir, 'assets'), path.join(appDir, 'assets'));

console.log('完成（仅代码，不含 node_modules）');
