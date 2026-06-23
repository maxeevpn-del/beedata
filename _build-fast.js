const fs = require('fs');
const path = require('path');

const dir = __dirname;
const appDir = path.join(dir, 'dist', 'BeeData', 'resources', 'app');

if (!fs.existsSync(appDir)) {
  console.log('Run node _build.js first');
  process.exit(1);
}

console.log('Copying source files...');

['main.js', 'preload.js', 'updater.js', 'version.json', 'package.json'].forEach(f => {
  fs.copyFileSync(path.join(dir, f), path.join(appDir, f));
});

// copy renderer
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

// copy assets
copyDir(path.join(dir, 'assets'), path.join(appDir, 'assets'));

console.log('Done (code only)');
