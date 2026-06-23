// Capacitor 端 API 桥接 - 和 electronAPI 接口一致
// 在 Android 上通过 Capacitor 插件 + fetch 实现

const isCapacitor = !!(window.Capacitor && window.Capacitor.Plugins);

if (isCapacitor) {
  const { Filesystem, Directory, Encoding } = window.Capacitor.Plugins;
  const Share = window.Capacitor.Plugins.Share;

  // HTTP 请求辅助
  async function httpGet(url, opts = {}) {
    const headers = { 'User-Agent': 'BeeData/1.0' };
    const res = await fetch(url, { headers, ...opts });
    return res.json();
  }

  async function httpPost(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'BeeData/1.0' },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  // 存储
  function storageGet(key) {
    try { return JSON.parse(localStorage.getItem('beedata_' + key) || '{}'); } catch { return {}; }
  }
  function storageSet(key, val) { localStorage.setItem('beedata_' + key, JSON.stringify(val)); }

  window.electronAPI = {
    // 抓取 DailyView - 使用 fetch 直连（需配置代理则通过服务端转发）
    fetch: async (params) => {
      const { topicId = '47', range = '7', proxy } = params;
      const allItems = [];
      for (let page = 1; page <= 10; page++) {
        const url = `https://dailyview.tw/top100/topic/${topicId}?range=${range}&page=${page}`;
        const html = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'zh-TW' } }).then(r => r.text());
        // 简单 DOM 解析 - 在 Capacitor 端用 DOMParser
        const items = parseDailyViewHTML(html);
        if (items.length === 0) break;
        allItems.push(...items);
        if (page > 1) await new Promise(r => setTimeout(r, 500));
      }
      return { success: true, count: allItems.length, items: allItems };
    },

    // 抓取 TV Stats
    tvFetch: async (params) => {
      const { date } = params;
      const url = `https://televisionstats.com/top/${date}`;
      const html = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      }).then(r => r.text());
      const items = parseTVStatsHTML(html);
      return { success: true, count: items.length, items };
    },

    // Excel 导出 - 使用 Capacitor Filesystem
    exportExcel: async (params) => {
      const { items, topicId, range } = params;
      const ExcelJS = window.ExcelJS;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('数据');
      sheet.columns = [
        { header: '排名', key: 'rank', width: 6 }, { header: '名称', key: 'title', width: 40 },
        { header: '网路口碑', key: 'volume', width: 12 }, { header: '正面', key: 'positive', width: 8 },
        { header: '中立', key: 'neutral', width: 8 }, { header: '负面', key: 'negative', width: 8 },
        { header: '热门关键字', key: 'keywords', width: 30 },
      ];
      items.forEach(item => sheet.addRow(item));
      const buf = await workbook.xlsx.writeBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const now = new Date();
      const ds = `${now.getMonth()+1}${now.getDate()}_${now.getHours()}${now.getMinutes()}`;
      const filename = `dailyview_${topicId}_${ds}.xlsx`;
      await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Documents,
      });
      return { success: true, filename, filepath: filename };
    },

    // Excel 导出 TV Stats
    tvExport: async (params) => {
      const { items, date } = params;
      const ExcelJS = window.ExcelJS;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('数据');
      sheet.columns = [
        { header: '排名', key: 'rank', width: 6 }, { header: '剧名', key: 'title', width: 40 },
        { header: '网络/平台', key: 'network', width: 20 }, { header: '热度分', key: 'buzzScore', width: 10 },
        { header: '状态', key: 'status', width: 10 },
      ];
      items.forEach(item => sheet.addRow(item));
      const buf = await workbook.xlsx.writeBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const filename = `tvstats_${date}.xlsx`;
      await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Documents });
      return { success: true, filename, filepath: filename };
    },

    // 话题列表
    getTopics: async () => {
      try {
        const html = await fetch('https://dailyview.tw/top100', {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'zh-TW' }
        }).then(r => r.text());
        const topics = [];
        const re = /\/top100\/topic\/(\d+)/g;
        let m;
        while ((m = re.exec(html)) !== null) {
          if (!topics.find(t => t.id === m[1])) topics.push({ id: m[1], name: '' });
        }
        return topics.length > 0 ? topics : [{ id: '47', name: '娱乐/台剧' }];
      } catch { return [{ id: '47', name: '娱乐/台剧' }]; }
    },

    // 配置（本地存储）
    getConfig: () => storageGet('config'),
    saveConfig: (params) => { storageSet('config', params); return { success: true }; },

    // 代理测试 - 直连
    testProxy: async (params) => {
      const results = [];
      for (const site of ['dailyview.tw', 'televisionstats.com']) {
        try {
          const start = Date.now();
          const r = await fetch(`https://${site}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          results.push({ site, success: true, statusCode: r.status, elapsed: (Date.now() - start) + 'ms' });
        } catch (e) {
          results.push({ site, success: false, error: e.message, hint: e.message });
        }
      }
      return results;
    },

    // 系统代理检测（移动端不支持）
    detectProxy: () => Promise.resolve({ found: false, proxy: null }),

    // 历史记录
    getHistory: () => storageGet('history'),
    getVersion: () => Promise.resolve({ version: '1.0.6' }),
    checkUpdate: async () => {
      try {
        const r = await fetch('https://beedata-1251427456.cos.ap-beijing.myqcloud.com/version.json', {
          headers: { 'User-Agent': 'BeeData-UpdateChecker/1.0' }
        });
        const remote = await r.json();
        return { current: '1.0.6', remote: remote.version, hasUpdate: remote.version !== '1.0.6', changelog: remote.changelog || [], downloadUrl: remote.downloadUrl, error: null };
      } catch (e) { return { current: '1.0.6', remote: null, hasUpdate: false, changelog: [], downloadUrl: '', error: e.message }; }
    },
    doUpgrade: () => Promise.resolve({ success: false, error: '请在手机浏览器中手动下载更新' }),

    // 文件操作
    openFile: async (filepath) => {
      try { await Share.share({ title: '分享文件', url: filepath, dialogTitle: '分享文件' }); } catch {}
      return { success: true };
    },
    openHistoryFile: async (filename) => {
      try { await Share.share({ title: '打开文件', url: filename, dialogTitle: '打开文件' }); } catch {}
      return { success: true };
    },

    // 进度事件（移动端无 SSE，用轮询替代）
    onFetchProgress: (cb) => { window._fetchProgressCB = cb; return cb; },
    offFetchProgress: () => { window._fetchProgressCB = null; },
  };
}

// HTML 解析辅助（Capacitor 端无法用 Node cheerio，改用 DOMParser）
function parseDailyViewHTML(html) {
  const items = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const cards = doc.querySelectorAll('[class*="ItemCard_rank_block"]');
  cards.forEach(card => {
    if (card.innerHTML.length > 25000) return;
    const rankEl = card.querySelector('[class*="ItemCard_ranking"]');
    const rank = parseInt(rankEl?.textContent?.trim()) || 0;
    if (rank < 1 || rank > 100) return;
    const titleEl = card.querySelector('[class*="ItemCard_item_title"]');
    const title = titleEl?.textContent?.trim();
    if (!title || title.length > 60) return;
    const text = card.textContent.replace(/\s+/g, ' ');
    const volMatch = text.match(/網路聲量\s*([\d,]+)\s*筆/);
    const volume = volMatch ? parseInt(volMatch[1].replace(/,/g, '')) : 0;
    const posMatch = text.match(/正面\s*(\d+)\s*%/);
    const neuMatch = text.match(/中立\s*(\d+)\s*%/);
    const negMatch = text.match(/負面\s*(\d+)\s*%/);
    let keywords = '-';
    const kwMatch = text.match(/熱門關鍵字\s*(.{1,50})/);
    if (kwMatch) { let raw = kwMatch[1].trim(); const ti = raw.search(/[0-9]|首頁|口碑|聲量排行|分析期間|什麼是/); if (ti > 0) raw = raw.slice(0, ti).trim(); else if (ti === 0) raw = ''; if (raw.length > 0) keywords = raw; }
    items.push({ rank, title, volume, positive: posMatch ? posMatch[1]+'%' : '-', neutral: neuMatch ? neuMatch[1]+'%' : '-', negative: negMatch ? negMatch[1]+'%' : '-', keywords });
  });
  return items;
}

function parseTVStatsHTML(html) {
  const items = [];
  try {
    const match = html.match(/__NEXT_DATA__"[^>]*>([^<]+)</);
    if (!match) return items;
    const data = JSON.parse(match[1]);
    const shows = data?.props?.pageProps?.shows;
    if (!Array.isArray(shows)) return items;
    shows.forEach((entry, idx) => {
      const show = entry.show || {};
      const networks = (show.networks || []).map(n => n.name).join(', ');
      items.push({
        rank: idx + 1,
        title: show.name || '-',
        network: networks || '-',
        buzzScore: entry.value != null ? entry.value.toFixed(1) : '-',
        status: show.in_production ? '播出中' : '已完结',
      });
    });
  } catch {}
  return items;
}
