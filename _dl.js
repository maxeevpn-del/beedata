const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

(async () => {
  const agent = new HttpsProxyAgent('http://127.0.0.1:7892');
  const url = 'https://github.com/electron/electron/releases/download/v22.3.27/electron-v22.3.27-win32-x64.zip';
  const zip = path.join(__dirname, 'electron.zip');
  const dist = path.join(__dirname, 'node_modules', 'electron', 'dist');
  
  console.log('Downloading Electron...');
  const r = await axios.get(url, { responseType: 'stream', httpsAgent: agent, proxy: false, timeout: 120000 });
  const w = fs.createWriteStream(zip);
  r.data.pipe(w);
  await new Promise(ok => w.on('finish', ok));
  
  console.log('Extracting...');
  fs.mkdirSync(dist, { recursive: true });
  execSync('powershell -Command Expand-Archive -Path ' + zip + ' -DestinationPath ' + dist + ' -Force', { stdio: 'inherit' });
  fs.unlinkSync(zip);
  console.log('Electron ready');
})();