const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');

// 单实例锁
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) { app.quit(); return; }

// 复制后端所有工具函数（不需要 HTTP 服务器）
const axios = require('axios');
const cheerio = require('cheerio');
const ExcelJS = require('exceljs');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const fs = require('fs');

let mainWindow;

// ========== 工具函数（从 server.js 迁移） ==========
const CONFIG_FILE = path.join(__dirname, 'config.json');
const HISTORY_FILE = path.join(__dirname, 'history.json');

function loadConfig() {
  try { return fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) : {}; } catch { return {}; }
}
function saveConfig(data) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf-8'); }
function loadHistory() {
  try { return fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8')) : []; } catch { return []; }
}
function saveHistory(h) { fs.writeFileSync(HISTORY_FILE, JSON.stringify(h), 'utf-8'); }
function addHistoryRecord(record) {
  const h = loadHistory();
  h.unshift({ id: Date.now().toString(36), time: new Date().toISOString(), ...record });
  if (h.length > 50) h.length = 50;
  saveHistory(h);
}
function getProxyAgent(proxyUrl, proxyType) {
  if (!proxyUrl) return null;
  return proxyType === 'socks5' ? new SocksProxyAgent(proxyUrl) : new HttpsProxyAgent(proxyUrl);
}

// 自动检测 Windows 系统代理
function detectSystemProxy() {
  try {
    const { execSync } = require('child_process');
    const regOut = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer 2>nul', { encoding: 'utf8', timeout: 3000 });
    const match = regOut.match(/ProxyServer\s+REG_SZ\s+(.+)/i);
    if (match) {
      const server = match[1].trim();
      const httpMatch = server.match(/https?=([^;]+)/);
      return { url: 'http://' + (httpMatch ? httpMatch[1] : server), type: 'http' };
    }
  } catch {}
  return null;
}

// 话题动态抓取
const FALLBACK_TOPIC_MAP = [{ id: '47', name: '娱乐／台剧' }];
let topicCache = null;

async function getTopicMap(proxyUrl, proxyType) {
  if (topicCache && Date.now() < topicCache.expireAt) return topicCache.topicMap;
  try {
    const agent = getProxyAgent(proxyUrl, proxyType);
    const opts = { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'zh-TW,zh;q=0.9' } };
    if (agent) { opts.httpsAgent = agent; opts.proxy = false; }
    const res = await axios.get('https://dailyview.tw/top100', opts);
    const $ = cheerio.load(res.data);
    const topics = [];
    $('a[href*="/top100/topic/"]').each((i, el) => {
      const m = ($(el).attr('href') || '').match(/\/top100\/topic\/(\d+)/);
      if (m) { const name = $(el).text().trim().replace(/\s+/g, ' '); if (name && name.length < 30) topics.push({ id: m[1], name }); }
    });
    if (topics.length > 0) { topicCache = { topicMap: topics, expireAt: Date.now() + 30 * 60 * 1000 }; return topics; }
  } catch (e) { /* offline */ }
  return FALLBACK_TOPIC_MAP;
}

// 抓取 + 解析
async function fetchPage(topicId, range, page, proxyUrl, proxyType, retry = 0) {
  const url = `https://dailyview.tw/top100/topic/${topicId}?range=${range}&page=${page}`;
  const agent = getProxyAgent(proxyUrl, proxyType);
  const opts = { timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'zh-TW,zh;q=0.9' } };
  if (agent) { opts.httpsAgent = agent; opts.proxy = false; }
  try {
    const res = await axios.get(url, opts);
    return res.data;
  } catch (e) {
    if (retry < 2) { await new Promise(r => setTimeout(r, 1000)); return fetchPage(topicId, range, page, proxyUrl, proxyType, retry + 1); }
    throw e;
  }
}

function parseCards(html) {
  const items = [];
  const cleanHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  const blocks = cleanHtml.split(/(?=class="[^"]*ItemCard_rank_block[^"]*")/g).filter(b => b.includes('ItemCard_rank_block'));
  for (const block of blocks) {
    if (block.length > 25000) continue;
    const $ = cheerio.load(block);
    const rank = parseInt($('[class*="ItemCard_ranking"]').text().trim()) || 0;
    if (rank < 1 || rank > 100) continue;
    const title = $('[class*="ItemCard_item_title"]').first().text().trim();
    if (!title || title.length > 60 || title.includes('{') || title.includes(';') || title.includes('.css-') || title.includes('.js(')) continue;
    const text = $('body').text().replace(/\s+/g, ' ');
    const volMatch = text.match(/網路聲量\s*([\d,]+)\s*筆/);
    const volume = volMatch ? parseInt(volMatch[1].replace(/,/g, '')) : 0;
    const posMatch = text.match(/正面\s*(\d+)\s*%/);
    const neuMatch = text.match(/中立\s*(\d+)\s*%/);
    const negMatch = text.match(/負面\s*(\d+)\s*%/);
    let keywords = '-';
    const kwMatch = text.match(/熱門關鍵字\s*(.{1,50})/);
    if (kwMatch) {
      let raw = kwMatch[1].trim();
      const ti = raw.search(/[0-9]|首頁|口碑|聲量排行|分析期間|什麼是/);
      if (ti > 0) raw = raw.slice(0, ti).trim();
      else if (ti === 0) raw = '';
      if (raw.length > 0) keywords = raw;
    }
    items.push({ rank, title, volume, positive: posMatch ? posMatch[1] + '%' : '-', neutral: neuMatch ? neuMatch[1] + '%' : '-', negative: negMatch ? negMatch[1] + '%' : '-', keywords });
  }
  return items;
}

// Excel 导出
async function exportToExcel(items, topicId, range) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('数据');
  sheet.columns = [
    { header: '排名', key: 'rank', width: 6 }, { header: '名称', key: 'title', width: 40 },
    { header: '网路口碑', key: 'volume', width: 12 }, { header: '正面', key: 'positive', width: 8 },
    { header: '中立', key: 'neutral', width: 8 }, { header: '负面', key: 'negative', width: 8 },
    { header: '热门关键字', key: 'keywords', width: 30 },
  ];
  items.forEach((item, idx) => {
    const row = sheet.addRow(item);
    row.getCell(1).alignment = row.getCell(3).alignment = row.getCell(4).alignment = row.getCell(5).alignment = row.getCell(6).alignment = { horizontal: 'center' };
    if (idx % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  });
  const now = new Date();
  const ds = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
  const filename = `dailyview_话题${topicId}_周榜_${ds}.xlsx`;
  const filepath = path.join(__dirname, filename);
  await workbook.xlsx.writeFile(filepath);
  return { filepath, filename };
}

// ========== IPC 处理器（替代 HTTP 路由） ==========
function setupIPC() {
  ipcMain.handle('api:topics', async () => {
    try { const cfg = loadConfig(); return await getTopicMap(cfg.proxy, cfg.proxyType); } catch { return FALLBACK_TOPIC_MAP; }
  });

  ipcMain.handle('api:config:get', () => {
    const c = loadConfig();
    return { proxy: c.proxy || '', proxyType: c.proxyType || 'http' };
  });

  ipcMain.handle('api:config:save', (event, data) => {
    saveConfig({ proxy: data.proxy || '', proxyType: data.proxyType || 'http' });
    return { success: true };
  });

  ipcMain.handle('api:test-proxy', async (event, data) => {
    try {
      const agent = getProxyAgent(data.proxy || '', data.proxyType || 'http');
      const opts = { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } };
      if (agent) { opts.httpsAgent = agent; opts.proxy = false; }
      const start = Date.now();
      const rsp = await axios.get('https://dailyview.tw', opts);
      const elapsed = Date.now() - start;
      return { success: true, statusCode: rsp.status, elapsed: `${elapsed}ms`, message: `dailyview.tw 可访问 (${rsp.status}, ${elapsed}ms)` };
    } catch (err) {
      return { success: false, error: err.message, hint: (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') ? '连接超时，请检查代理' : err.message };
    }
  });

  ipcMain.handle('api:detect-proxy', () => {
    const p = detectSystemProxy();
    return { found: !!p, proxy: p };
  });

  ipcMain.handle('api:history', () => loadHistory());

  ipcMain.handle('api:version', () => {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf-8')); } catch { return { version: '1.0.0' }; }
  });

  ipcMain.handle('api:check-update', async () => {
    try {
      const v = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf-8'));
      let remote = null;
      try {
        if (v.updateUrl) { const r = await axios.get(v.updateUrl, { timeout: 8000 }); remote = r.data; }
      } catch {}
      return { current: v.version, remote: remote ? remote.version : null, hasUpdate: remote ? remote.version !== v.version : false, updateUrl: remote ? (remote.downloadUrl || v.updateUrl) : null };
    } catch { return { current: '1.0.0', hasUpdate: false }; }
  });

  ipcMain.handle('api:fetch', async (event, params) => {
    const { topicId = '47', range = '7', proxy, proxyType } = params;
    const cfg = loadConfig();
    const pUrl = proxy || cfg.proxy || '';
    const pType = proxyType || cfg.proxyType || 'http';

    const allItems = [];
    for (let page = 1; page <= 10; page++) {
      const html = await fetchPage(topicId, range, page, pUrl, pType);
      const items = parseCards(html);
      if (items.length === 0) break;
      allItems.push(...items);
      // 通过 IPC 事件发送进度
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('fetch:progress', { page, count: items.length, runningTotal: allItems.length, items });
      }
      if (page > 1) await new Promise(r => setTimeout(r, 500));
    }
    addHistoryRecord({ type: 'fetch', source: 'DailyView', topicId, range, count: allItems.length, status: 'success' });
    return { success: true, count: allItems.length, items: allItems };
  });

  ipcMain.handle('api:export', async (event, params) => {
    try {
      const result = await exportToExcel(params.items || [], params.topicId || '47', params.range || '7');
      addHistoryRecord({ type: 'export', source: 'DailyView', topicId: params.topicId || '47', range: params.range || '7', count: (params.items || []).length, status: 'success', filename: result.filename });
      return { success: true, ...result };
    } catch (err) {
      addHistoryRecord({ type: 'export', source: 'DailyView', status: 'failed', error: err.message });
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('api:upgrade', async () => {
    try {
      const v = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf-8'));
      const { execSync } = require('child_process');

      // 方案1: 尝试 git pull
      try {
        execSync('git pull origin master', { encoding: 'utf8', cwd: __dirname, timeout: 15000 });
        const newV = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf-8'));
        if (newV.version !== v.version) {
          return { success: true, updatedTo: newV.version, method: 'git' };
        }
      } catch (e) { /* git not available */ }

      // 方案2: 下载 zip 覆盖
      const downloadUrl = v.downloadUrl;
      if (!downloadUrl) return { success: false, error: 'No downloadUrl configured' };

      console.log('[更新] 下载更新包:', downloadUrl);
      const agent = getProxyAgent(loadConfig().proxy, loadConfig().proxyType);
      const opts = { timeout: 120000, responseType: 'stream' };
      if (agent) { opts.httpsAgent = agent; opts.proxy = false; }
      const res = await axios.get(downloadUrl, opts);

      const zipPath = path.join(__dirname, 'update.zip');
      const writer = fs.createWriteStream(zipPath);
      res.data.pipe(writer);
      await new Promise((ok, err) => { writer.on('finish', ok); writer.on('error', err); });
      console.log('[更新] 下载完成，解压...');

      const tmpDir = path.join(__dirname, '_update_tmp');
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.mkdirSync(tmpDir, { recursive: true });
      execSync('powershell -Command Expand-Archive -Path "' + zipPath + '" -DestinationPath "' + tmpDir + '" -Force', { stdio: 'ignore' });

      // 找到 zip 内的子目录
      let srcDir = tmpDir;
      const items = fs.readdirSync(tmpDir);
      for (const item of items) {
        const itemPath = path.join(tmpDir, item);
        if (fs.statSync(itemPath).isDirectory()) { srcDir = itemPath; break; }
      }

      // 复制文件到 app 目录
      const appDir = __dirname; // 在打包环境中 __dirname 是 resources/app
      const preserveFiles = ['config.json', 'history.json'];
      copyDirSync(srcDir, appDir, preserveFiles);
      console.log('[更新] 文件已覆盖');

      // 清理
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.unlinkSync(zipPath);

      const newV = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf-8'));
      // 2 秒后重启
      setTimeout(() => { app.relaunch(); app.exit(); }, 1500);
      return { success: true, updatedTo: newV.version, method: 'download' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

// ========== 窗口创建 ==========
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 860, minWidth: 960, minHeight: 640,
    title: 'MFData - 数据抓取工具',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');

  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  mainWindow.on('closed', () => { mainWindow = null; app.quit(); process.exit(0); });
}

app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});

function copyDirSync(src, dest, preserveFiles = []) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
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

app.whenReady().then(() => { setupIPC(); createWindow(); });
app.on('window-all-closed', () => { app.quit(); process.exit(0); });
