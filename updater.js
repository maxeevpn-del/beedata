// MFData 版本更新模块
// 通过 IPC 暴露给 main.js 调用

const path = require('path');
const fs = require('fs');
const axios = require('axios');

/**
 * 检查更新：对比本地与远程版本号
 * @returns {{ current: string, remote: string|null, hasUpdate: boolean, updateUrl: string|null }}
 */
async function checkForUpdate() {
  const v = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf-8'));
  let remote = null;
  try {
    if (v.updateUrl) {
      const r = await axios.get(v.updateUrl, { timeout: 8000, headers: { 'User-Agent': 'MFData-UpdateChecker/1.0' } });
      remote = r.data;
    }
  } catch (e) { /* ignore */ }
  return {
    current: v.version,
    remote: remote ? remote.version : null,
    hasUpdate: remote ? remote.version !== v.version : false,
    updateUrl: remote ? (remote.downloadUrl || v.updateUrl) : null,
  };
}

/**
 * 执行升级：下载 zip 覆盖应用文件
 * @param {object} options - { proxy?: string, proxyType?: string, giteeToken?: string }
 * @returns {{ success: boolean, updatedTo?: string, error?: string }}
 */
async function performUpgrade(options = {}) {
  const { getProxyAgent } = require('./main.js') || {};
  const v = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf-8'));
  const downloadUrl = v.downloadUrl;
  if (!downloadUrl) return { success: false, error: 'No downloadUrl configured in version.json' };

  try {
    console.log('[Updater] Downloading:', downloadUrl);
    const agent = options.proxy ? (options.proxyType === 'socks5'
      ? new (require('socks-proxy-agent').SocksProxyAgent)(options.proxy)
      : new (require('https-proxy-agent').HttpsProxyAgent)(options.proxy)) : null;

    const opts = { timeout: 120000, responseType: 'stream' };
    if (agent) { opts.httpsAgent = agent; opts.proxy = false; }

    let response;
    try {
      response = await axios.get(downloadUrl, opts);
      const contentType = response.headers['content-type'] || '';
      if (contentType.includes('text/html')) {
        return { success: false, error: '无法访问更新包。请确认仓库为公开状态（https://gitee.com/xtthmm/mfdata）' };
      }
    } catch (e1) {
      return { success: false, error: '下载更新包失败: ' + (e1.code || e1.message) };
    }

    // 保存 zip
    const zipPath = path.join(__dirname, 'update.zip');
    const writer = fs.createWriteStream(zipPath);
    response.data.pipe(writer);
    await new Promise((ok, err) => { writer.on('finish', ok); writer.on('error', err); });
    console.log('[Updater] Downloaded, extracting...');

    // 解压
    const tmpDir = path.join(__dirname, '_update_tmp');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
    const { execSync } = require('child_process');
    execSync('powershell -Command Expand-Archive -Path "' + zipPath + '" -DestinationPath "' + tmpDir + '" -Force', { stdio: 'ignore' });

    // 找到 zip 根目录
    let srcDir = tmpDir;
    for (const item of fs.readdirSync(tmpDir)) {
      const p = path.join(tmpDir, item);
      if (fs.statSync(p).isDirectory()) { srcDir = p; break; }
    }

    // 覆盖文件到 app 目录（保留 config.json、history.json）
    copyDirSync(srcDir, __dirname, ['config.json', 'history.json']);
    console.log('[Updater] Files overwritten');

    // 清理
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.unlinkSync(zipPath);

    const newV = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf-8'));
    return { success: true, updatedTo: newV.version };
  } catch (e) {
    console.error('[Updater] Failed:', e);
    return { success: false, error: e.message };
  }
}

function copyDirSync(src, dest, preserveFiles = []) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      copyDirSync(srcPath, destPath, preserveFiles);
    } else {
      if (preserveFiles.includes(entry.name) && fs.existsSync(destPath)) continue;
      try { fs.copyFileSync(srcPath, destPath); } catch {}
    }
  }
}

module.exports = { checkForUpdate, performUpgrade };