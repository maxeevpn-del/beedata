const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');

function getLocalVersion() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf-8'));
}

function buildAgent(proxyUrl, proxyType) {
  if (!proxyUrl) return null;
  try {
    if (proxyType === 'socks5') return new (require('socks-proxy-agent').SocksProxyAgent)(proxyUrl);
    return new (require('https-proxy-agent').HttpsProxyAgent)(proxyUrl);
  } catch { return null; }
}

async function checkForUpdate(proxyUrl, proxyType) {
  const local = getLocalVersion();
  const agent = proxyUrl ? buildAgent(proxyUrl, proxyType) : null;
  let remote = null;
  let error = null;
  try {
    if (local.updateUrl) {
      const opts = { timeout: 10000, headers: { 'User-Agent': 'BeeData-UpdateChecker/1.0' } };
      if (agent) { opts.httpsAgent = agent; opts.proxy = false; }
      const r = await axios.get(local.updateUrl, opts);
      remote = r.data;
    }
  } catch (e) { error = e.code || e.message; }
  return {
    current: local.version,
    remote: remote ? remote.version : null,
    hasUpdate: remote ? remote.version !== local.version : false,
    changelog: remote ? (remote.changelog || []) : [],
    downloadUrl: remote ? (remote.downloadUrl || '') : '',
    error,
  };
}

async function performUpgrade(options = {}) {
  const local = getLocalVersion();
  const { proxy, proxyType } = options;

  let downloadUrl = local.downloadUrl;
  if (!downloadUrl) {
    const info = await checkForUpdate(proxy, proxyType);
    if (!info.hasUpdate) return { success: false, error: 'No update available' };
    downloadUrl = info.downloadUrl;
  }
  if (!downloadUrl) return { success: false, error: 'Download URL not configured' };

  try {
    const tmpDir = path.join(os.tmpdir(), 'beedata-update');
    fs.mkdirSync(tmpDir, { recursive: true });
    const installerPath = path.join(tmpDir, 'BeeData-Setup.exe');

    const agent = buildAgent(proxy, proxyType);
    const opts = { timeout: 300000, responseType: 'stream', headers: { 'User-Agent': 'BeeData-Updater/1.0' } };
    if (agent) { opts.httpsAgent = agent; opts.proxy = false; }

    const response = await axios.get(downloadUrl, opts);
    const writer = fs.createWriteStream(installerPath);
    response.data.pipe(writer);
    await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });

    const { execSync } = require('child_process');
    execSync('start "" "' + installerPath + '"', { shell: true });
    return { success: true, message: 'Installer downloaded and launched. Follow the wizard to complete update.' };
  } catch (e) {
    return { success: false, error: 'Download failed: ' + (e.code || e.message) };
  }
}

module.exports = { checkForUpdate, performUpgrade };
