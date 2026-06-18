const http = require('http');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const ExcelJS = require('exceljs');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

const PORT = 3456;
const CONFIG_FILE = path.join(__dirname, 'config.json');
const HISTORY_FILE = path.join(__dirname, 'history.json');

function loadHistory() {
  try { if (fs.existsSync(HISTORY_FILE)) return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8')); } catch {}
  return [];
}
function saveHistory(h) { fs.writeFileSync(HISTORY_FILE, JSON.stringify(h), 'utf-8'); }
function addHistoryRecord(record) {
  const h = loadHistory();
  h.unshift({ id: Date.now().toString(36), time: new Date().toISOString(), ...record });
  if (h.length > 50) h.length = 50;
  saveHistory(h);
}
function updateHistoryRecord(id, updates) {
  const h = loadHistory();
  const idx = h.findIndex(r => r.id === id);
  if (idx >= 0) { Object.assign(h[idx], updates); saveHistory(h); }
}

// ========== 话题 ID 中文对照表（缓存 + 动态抓取） ==========
const FALLBACK_TOPIC_MAP = [
  { id: '47',  name: '娱乐／台剧' },
];
let topicCache = null;

async function fetchTopicsFromSite(proxyUrl, proxyType) {
  const url = 'https://dailyview.tw/top100';
  const options = {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-TW,zh;q=0.9',
    },
  };
  const agent = getProxyAgent(proxyUrl, proxyType);
  if (agent) { options.httpsAgent = agent; options.proxy = false; }
  const response = await axios.get(url, options);
  const $ = cheerio.load(response.data);
  const topics = [];
  $('a[href*="/top100/topic/"]').each((i, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/\/top100\/topic\/(\d+)/);
    if (m) {
      const id = m[1];
      const name = $(el).text().trim().replace(/\s+/g, ' ');
      if (name && name.length < 30 && !topics.find(t => t.id === id)) {
        topics.push({ id, name });
      }
    }
  });
  console.log(`[话题] 从网站获取到 ${topics.length} 个话题`);
  return topics.length > 0 ? topics : null;
}

async function getTopicMap(proxyUrl, proxyType) {
  if (topicCache && Date.now() < topicCache.expireAt) return topicCache.topicMap;
  try {
    const live = await fetchTopicsFromSite(proxyUrl, proxyType);
    if (live) {
      for (const fb of FALLBACK_TOPIC_MAP) {
        if (!live.find(t => t.id === fb.id)) live.push(fb);
      }
      topicCache = { topicMap: live, expireAt: Date.now() + 30 * 60 * 1000 };
      return live;
    }
  } catch (e) { console.log(`[话题] 线上抓取失败: ${e.message}`); }
  return FALLBACK_TOPIC_MAP;
}

// ========== 工具函数 ==========
function loadConfig() {
  try { if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch {}
  return { proxy: '', proxyType: 'http' };
}
function saveConfig(config) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8'); }
function getProxyAgent(proxyUrl, proxyType) {
  if (!proxyUrl) return null;
  if (proxyType === 'socks5') return new SocksProxyAgent(proxyUrl);
  return new HttpsProxyAgent(proxyUrl);
}

// 自动检测 Windows 系统代理设置
function detectSystemProxy() {
  try {
    const { execSync } = require('child_process');
    // 方法 1: 读取注册表
    const regOut = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer 2>nul',
      { encoding: 'utf8', timeout: 3000 }
    );
    const match = regOut.match(/ProxyServer\s+REG_SZ\s+(.+)/i);
    if (match) {
      const server = match[1].trim();
      // 格式可能是 "127.0.0.1:7890" 或 "http=127.0.0.1:7890;https=127.0.0.1:7890"
      const httpMatch = server.match(/https?=([^;]+)/);
      const addr = httpMatch ? httpMatch[1] : server;
      return { url: 'http://' + addr, type: 'http' };
    }
  } catch (e) { /* registry read failed */ }

  try {
    // 方法 2: netsh winhttp
    const winhttpOut = require('child_process').execSync(
      'netsh winhttp show proxy',
      { encoding: 'utf8', timeout: 3000 }
    );
    const m = winhttpOut.match(/代理服务器\s*:\s*(.+)/);
    if (m) {
      const addr = m[1].trim();
      if (addr && addr !== '无' && addr !== '(null)') {
        return { url: 'http://' + addr, type: 'http' };
      }
    }
  } catch (e) { /* netsh failed */ }

  return null;
}

// ========== 网络抓取 ==========
async function fetchPage(topicId, range, page, proxyUrl, proxyType, retryCount = 0) {
  const url = `https://dailyview.tw/top100/topic/${topicId}?range=${range}&page=${page}`;
  const options = {
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-TW,zh;q=0.9',
    },
  };
  const agent = getProxyAgent(proxyUrl, proxyType);
  if (agent) { options.httpsAgent = agent; options.proxy = false; }
  try {
    console.log(`[抓取] 第 ${page} 页: ${url}`);
    const res = await axios.get(url, options);
    const c = (res.data.match(/ItemCard_rank_block/g) || []).length;
    console.log(`[抓取] 第 ${page} 页 → ${res.status}, ${c} 条`);
    return res.data;
  } catch (err) {
    if (retryCount < 2) { await new Promise(r => setTimeout(r, 1000)); return fetchPage(topicId, range, page, proxyUrl, proxyType, retryCount + 1); }
    throw err;
  }
}

async function fetchAllPages(topicId, range, proxyUrl, proxyType, maxPages = 10, onProgress = null) {
  let allHtml = '';
  for (let p = 1; p <= maxPages; p++) {
    const html = await fetchPage(topicId, range, p, proxyUrl, proxyType);
    const items = parseCards(html);
    if (items.length === 0) break;
    allHtml += html + '<!--PAGE_SEP-->';
    if (onProgress) onProgress({ page: p, count: items.length, items });
    if (p > 1) await new Promise(r => setTimeout(r, 500));
  }
  return allHtml;
}

// ========== 核心解析：卡片分割 + cheerio 提取 ==========
function parseCards(html) {
  const items = [];
  // 去除 <script>/<style>/<noscript> 干扰标签
  const cleanHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  const blocks = cleanHtml.split(/(?=class="[^"]*ItemCard_rank_block[^"]*")/g).filter(b => b.includes('ItemCard_rank_block'));
  console.log(`[解析] 卡片分割: ${blocks.length} 块`);

  for (const block of blocks) {
    // 跳过异常的极长块（真正有效的卡片最多约 10000 字节，带尾部可能到 20000）
    if (block.length > 25000) continue;
    
    const $ = cheerio.load(block);

    const rankEl = $('[class*="ItemCard_ranking"]');
    const rankText = rankEl.text().trim();
    const rank = parseInt(rankText) || 0;
    if (rank < 1 || rank > 100) continue;

    const titleEl = $('[class*="ItemCard_item_title"]').first();
    const title = titleEl.text().trim();
    // 标题必须短且不含 CSS/JS 代码特征
    if (!title || title.length > 60 || title.includes('{') || title.includes(';') || title.includes('.css-') || title.includes('.js(')) continue;

    const text = $('body').text().replace(/\s+/g, ' ');

    const volMatch = text.match(/網路聲量\s*([\d,]+)\s*筆/);
    const volume = volMatch ? parseInt(volMatch[1].replace(/,/g, '')) : 0;

    const posMatch = text.match(/正面\s*(\d+)\s*%/);
    const neuMatch = text.match(/中立\s*(\d+)\s*%/);
    const negMatch = text.match(/負面\s*(\d+)\s*%/);
    const positive = posMatch ? posMatch[1] + '%' : '-';
    const neutral  = neuMatch ? neuMatch[1] + '%' : '-';
    const negative = negMatch ? negMatch[1] + '%' : '-';

    // 热门关键字：取"熱門關鍵字"后40字符，遇到数字/导航词则截断
    const kwMatch = text.match(/熱門關鍵字\s*(.{1,50})/);
    let keywords = '-';
    if (kwMatch) {
      let raw = kwMatch[1].trim();
      const trashIdx = raw.search(/[0-9]|首頁|口碑|聲量排行|分析期間|什麼是/);
      if (trashIdx > 0) raw = raw.slice(0, trashIdx).trim();
      else if (trashIdx === 0) raw = '';
      if (raw.length > 0) keywords = raw;
    }

    items.push({ rank, title, volume, positive, neutral, negative, keywords });
  }
  console.log(`[解析] 有效性条目: ${items.length} 条`);
  return items;
}

// ========== Excel 导出 ==========
async function exportToExcel(items, topicId, range) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('周榜数据');

  // 7 列：排名、名称、網路口碑、正面、中立、負面、熱門關鍵字
  // 前两行：第一行情绪分佈合并，第二行子标题
  sheet.columns = [
    { header: '排名', key: 'rank', width: 6 },
    { header: '名称', key: 'title', width: 40 },
    { header: '網路口碑', key: 'volume', width: 12 },
    { header: '正面', key: 'positive', width: 8 },
    { header: '中立', key: 'neutral', width: 8 },
    { header: '負面', key: 'negative', width: 8 },
    { header: '熱門關鍵字', key: 'keywords', width: 30 },
  ];

  const row0 = sheet.getRow(1);
  row0.getCell(1).value = '排名';
  row0.getCell(2).value = '名称';
  row0.getCell(3).value = '網路口碑';
  row0.getCell(4).value = '情緒分佈';
  sheet.mergeCells(1, 4, 1, 6);
  row0.getCell(4).alignment = { horizontal: 'center' };
  row0.getCell(7).value = '熱門關鍵字';

  const row1 = sheet.getRow(2);
  row1.getCell(4).value = '正面';
  row1.getCell(5).value = '中立';
  row1.getCell(6).value = '負面';
  for (let c = 1; c <= 7; c++) {
    if (c >= 4 && c <= 6) continue;
    sheet.mergeCells(1, c, 2, c);
  }
  for (let r = 1; r <= 2; r++) {
    const row = sheet.getRow(r);
    row.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    row.alignment = { horizontal: 'center', vertical: 'middle' };
    row.height = 22;
  }

  items.forEach((item, idx) => {
    const row = sheet.addRow(item);
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(6).alignment = { horizontal: 'center' };
    if (idx % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    }
  });

  // 边框
  sheet.eachRow((row, rn) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
  });

  const now = new Date();
  const ds = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
  const filename = `dailyview_话题${topicId}_周榜_${ds}.xlsx`;
  const filepath = path.join(__dirname, filename);
  await workbook.xlsx.writeFile(filepath);
  console.log(`[导出] Excel 已保存: ${filepath}`);
  return { filepath, filename };
}

// ========== HTTP 服务器 ==========
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
};
function serveStaticFile(res, urlPath) {
  let fp = urlPath === '/' ? '/index.html' : urlPath;
  fp = path.join(__dirname, fp);
  const ext = path.extname(fp).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': mime }); res.end(data);
  });
}
function parseBody(req) {
  return new Promise(resolve => {
    let b = ''; req.on('data', c => b += c);
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // /api/test-proxy
  if (url.pathname === '/api/test-proxy' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const p = body.proxy || '', pt = body.proxyType || 'http';
      const opts = { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } };
      const ag = getProxyAgent(p, pt); if (ag) { opts.httpsAgent = ag; opts.proxy = false; }
      const start = Date.now(); const rsp = await axios.get('https://dailyview.tw', opts);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, statusCode: rsp.status, elapsed: `${Date.now()-start}ms`, message: `dailyview.tw 可访问 (${rsp.status}, ${Date.now()-start}ms)` }));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message, hint: (err.code==='ETIMEDOUT'||err.code==='ECONNREFUSED')?'连接超时，请检查代理':`请求失败: ${err.message}` }));
    }
    return;
  }

  // /api/fetch — SSE 流式
  if (url.pathname === '/api/fetch' && req.method === 'POST') {
    const body = await parseBody(req);
    const topicId = body.topicId || '47', range = body.range || '7';
    const cfg = loadConfig();
    const proxyUrl = body.proxy || cfg.proxy || '', proxyType = body.proxyType || cfg.proxyType || 'http';
    console.log(`[API] SSE抓取: topic=${topicId}, range=${range}`);
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    let allItems = [];
    function send(event, data) { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }
    try {
      await fetchAllPages(topicId, range, proxyUrl, proxyType, 10, (prog) => {
        send('page', { page: prog.page, count: prog.count, items: prog.items, runningTotal: allItems.length + prog.items.length });
        allItems.push(...prog.items);
      });
      // 记录抓取历史
      addHistoryRecord({
        type: 'fetch',
        source: 'DailyView',
        topicId, range,
        count: allItems.length,
        status: 'success',
      });
      send('done', { success: true, count: allItems.length, items: allItems });
    } catch (err) {
      addHistoryRecord({
        type: 'fetch',
        source: 'DailyView',
        topicId, range,
        count: 0,
        status: 'failed',
        error: err.message,
      });
      console.error('[SSE错误]', err.message);
      send('error', { success: false, error: err.message, hint: (err.code==='ETIMEDOUT'||err.code==='ECONNREFUSED')?'连接超时':'请求失败' });
    }
    res.end();
    return;
  }

  // /api/export
  if (url.pathname === '/api/export' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const result = await exportToExcel(body.items || [], body.topicId || '47', body.range || '7');
      // 记录导出历史
      addHistoryRecord({
        type: 'export',
        source: 'DailyView',
        topicId: body.topicId || '47',
        range: body.range || '7',
        count: (body.items || []).length,
        status: 'success',
        filename: result.filename,
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, ...result }));
    } catch (err) {
      addHistoryRecord({
        type: 'export',
        source: 'DailyView',
        status: 'failed',
        error: err.message,
      });
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // /api/topics
  if (url.pathname === '/api/topics' && req.method === 'GET') {
    try {
      const cfg = loadConfig();
      const m = await getTopicMap(cfg.proxy, cfg.proxyType);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(m));
    } catch { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(FALLBACK_TOPIC_MAP)); }
    return;
  }

  // /api/config
  if (url.pathname === '/api/config' && req.method === 'GET') {
    const c = loadConfig();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ proxy: c.proxy || '', proxyType: c.proxyType || 'http' }));
    return;
  }
  if (url.pathname === '/api/config' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      saveConfig({ proxy: body.proxy || '', proxyType: body.proxyType || 'http' });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ success: true }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ success: false, error: err.message })); }
    return;
  }

  // /api/version
  if (url.pathname === '/api/version' && req.method === 'GET') {
    try {
      const v = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf-8'));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(v));
    } catch { res.writeHead(500); res.end('{}'); }
    return;
  }

  // /api/check-update - 检查并可选执行更新
  if (url.pathname === '/api/check-update') {
    try {
      const v = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf-8'));
      let remote = null;
      try {
        if (v.updateUrl) {
          const remoteRes = await axios.get(v.updateUrl, { timeout: 8000, headers: { 'User-Agent': 'MFData-UpdateChecker/1.0' } });
          remote = remoteRes.data;
        }
      } catch (e) { /* remote check failed */ }

      const hasUpdate = remote ? (remote.version !== v.version) : false;

      // 如果请求包含 action=upgrade，执行 git pull 升级
      if (req.method === 'POST' && hasUpdate) {
        const body = await parseBody(req);
        if (body.action === 'upgrade') {
          try {
            const { execSync } = require('child_process');
            // 执行 git pull 拉取最新代码
            const result = execSync('git pull origin master', { encoding: 'utf8', cwd: __dirname, timeout: 30000 });
            console.log('[更新] git pull 成功:', result.trim());

            // 更新本地 version.json 为远程版本号（git pull 后自动覆盖）
            const newV = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf-8'));

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ 
              success: true, 
              updatedTo: newV.version,
              message: '已更新到 ' + newV.version + '，服务即将自动重启...',
              needRestart: false,
            }));
            // 1.5 秒后自动重启
            setTimeout(() => { 
              console.log('[更新] 服务即将重启...');
              const { spawn } = require('child_process');
              const child = spawn(process.argv[0], [process.argv[1]], { detached: true, stdio: 'ignore' });
              child.unref();
              process.exit(0);
            }, 1500);
            return;
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: 'git pull 失败: ' + (e.stderr || e.message) }));
            return;
          }
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        current: v.version,
        buildDate: v.buildDate,
        changelog: v.changelog || [],
        remote: remote ? remote.version : null,
        hasUpdate,
        updateUrl: remote ? remote.downloadUrl || v.updateUrl : null,
      }));
    } catch { res.writeHead(500); res.end('{}'); }
    return;
  }

  // /api/detect-proxy - 自动检测 Windows 系统代理
  if (url.pathname === '/api/detect-proxy' && req.method === 'GET') {
    const proxy = detectSystemProxy();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ found: !!proxy, proxy }));
    return;
  }

  // /api/history
  if (url.pathname === '/api/history' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(loadHistory()));
    return;
  }

  // /api/download
  if (url.pathname === '/api/download' && req.method === 'GET') {
    const fn = url.searchParams.get('file');
    if (!fn) { res.writeHead(400); res.end('Missing file'); return; }
    const fp = path.join(__dirname, fn);
    if (!fs.existsSync(fp)) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${encodeURIComponent(fn)}"` });
    fs.createReadStream(fp).pipe(res);
    return;
  }

  serveStaticFile(res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`======================================`);
  console.log(`  DailyView 周榜抓取工具已启动`);
  console.log(`  打开浏览器访问: http://localhost:${PORT}`);
  console.log(`======================================`);
  const { exec } = require('child_process');
  exec(`start http://localhost:${PORT}`);
});