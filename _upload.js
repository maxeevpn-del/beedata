const COS = require('cos-nodejs-sdk-v5');
const fs = require('fs');
const path = require('path');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '_cos-config.json'), 'utf-8'));
const cos = new COS({ SecretId: cfg.SecretId, SecretKey: cfg.SecretKey });

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
const version = pkg.version;
const file = `BeeData-Setup-${version}.exe`;
const filePath = path.join(__dirname, 'dist', file);

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  console.log('Run node _build-fast.js and NSIS compile first.');
  process.exit(1);
}

console.log(`Uploading ${file} (${(fs.statSync(filePath).size / 1024 / 1024).toFixed(1)} MB)...`);

cos.putObject({
  Bucket: cfg.Bucket,
  Region: cfg.Region,
  Key: file,
  Body: fs.createReadStream(filePath),
  ACL: 'public-read',
  onProgress: (info) => {
    const pct = Math.round(info.percent * 100);
    process.stdout.write(`\r  ${pct}%  ${(info.speed / 1024 / 1024).toFixed(1)} MB/s`);
  },
}, (err, data) => {
  if (err) { console.error('\nUpload failed:', err); process.exit(1); }
  console.log('\nUpload complete!');
  const url = `https://${cfg.Bucket}.cos.${cfg.Region}.myqcloud.com/${file}`;
  console.log(`Download URL: ${url}`);
});
