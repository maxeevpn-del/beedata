// Capacitor API bridge
const isCapacitor = !!(window.Capacitor && window.Capacitor.Plugins);

if (isCapacitor) {
  const { Filesystem, Directory } = window.Capacitor.Plugins;
  const Share = window.Capacitor.Plugins.Share;
  const Http = window.CapacitorHttp || window.Capacitor.Plugins.CapacitorHttp;

  async function httpGet(url, extraHeaders = {}) {
    const res = await Http.request({
      method: 'GET', url,
      headers: { 'User-Agent': 'BeeData/1.0', ...extraHeaders },
      connectTimeout: 15000, readTimeout: 30000,
    });
    return res.data;
  }

  async function httpGetText(url, extraHeaders = {}) {
    const res = await Http.request({
      method: 'GET', url,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...extraHeaders,
      },
      connectTimeout: 15000, readTimeout: 30000,
    });
    if (typeof res.data === 'string') return res.data;
    if (res.data instanceof ArrayBuffer) {
      const decoder = new TextDecoder('utf-8');
      return decoder.decode(res.data);
    }
    return String(res.data);
  }

  function storageGet(key) {
    try { return JSON.parse(localStorage.getItem('beedata_' + key) || '{}'); } catch { return {}; }
  }
  function storageSet(key, val) { localStorage.setItem('beedata_' + key, JSON.stringify(val)); }

  window.electronAPI = {
    fetch: async (params) => {
      const { topicId = '47', range = '7' } = params;
      const allItems = [];
      for (let page = 1; page <= 10; page++) {
        const url = `https://dailyview.tw/top100/topic/${topicId}?range=${range}&page=${page}`;
        const html = await httpGetText(url, { 'Accept-Language': 'zh-TW' });
        const items = parseDailyViewHTML(html);
        if (items.length === 0) break;
        allItems.push(...items);
        if (page > 1) await new Promise(r => setTimeout(r, 500));
      }
      return { success: true, count: allItems.length, items: allItems };
    },

    tvFetch: async (params) => {
      const { date } = params;
      try {
        const url = `https://televisionstats.com/top/${date}`;
        const html = await httpGetText(url, { 'Accept-Language': 'en-US,en;q=0.9' });
        if (!html || html.length < 100) return { success: false, error: 'Empty response' };
        if (html.includes('Just a moment') || html.includes('cf-browser-verification')) return { success: false, error: 'Blocked by Cloudflare' };
        if (!html.includes('__NEXT_DATA__')) return { success: false, error: 'No data. Length:' + html.length + ' Starts:' + html.substring(0, 80) };
        const items = parseTVStatsHTML(html);
        return { success: true, count: items.length, items };
      } catch (e) {
        return { success: false, error: 'Fetch failed: ' + (e.message || 'unknown') };
      }
    },

    exportExcel: async (params) => {
      const { items, topicId } = params;
      const workbook = new window.ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('data');
      sheet.columns = [
        { header: 'rank', key: 'rank', width: 6 }, { header: 'title', key: 'title', width: 40 },
        { header: 'volume', key: 'volume', width: 12 }, { header: 'positive', key: 'positive', width: 8 },
        { header: 'neutral', key: 'neutral', width: 8 }, { header: 'negative', key: 'negative', width: 8 },
        { header: 'keywords', key: 'keywords', width: 30 },
      ];
      items.forEach(item => sheet.addRow(item));
      const buf = await workbook.xlsx.writeBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const now = new Date();
      const ds = `${now.getMonth()+1}${now.getDate()}_${now.getHours()}${now.getMinutes()}`;
      const filename = `dailyview_${topicId}_${ds}.xlsx`;
      await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Documents });
      return { success: true, filename, filepath: filename };
    },

    tvExport: async (params) => {
      const { items, date } = params;
      const workbook = new window.ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('data');
      sheet.columns = [
        { header: 'rank', key: 'rank', width: 6 }, { header: 'title', key: 'title', width: 40 },
        { header: 'network', key: 'network', width: 20 }, { header: 'buzzScore', key: 'buzzScore', width: 10 },
        { header: 'status', key: 'status', width: 10 },
      ];
      items.forEach(item => sheet.addRow(item));
      const buf = await workbook.xlsx.writeBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const filename = `tvstats_${date}.xlsx`;
      await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Documents });
      return { success: true, filename, filepath: filename };
    },

    getTopics: async () => {
      try {
        const html = await httpGetText('https://dailyview.tw/top100', { 'Accept-Language': 'zh-TW' });
        const topics = [];
        const re = /\/top100\/topic\/(\d+)/g;
        let m;
        while ((m = re.exec(html)) !== null) {
          if (!topics.find(t => t.id === m[1])) topics.push({ id: m[1], name: '' });
        }
        return topics.length > 0 ? topics : [{ id: '47', name: 'entertainment' }];
      } catch { return [{ id: '47', name: 'entertainment' }]; }
    },

    getConfig: () => storageGet('config'),
    saveConfig: (params) => { storageSet('config', params); return { success: true }; },

    testProxy: async (params) => {
      const results = [];
      for (const site of ['dailyview.tw', 'televisionstats.com']) {
        try {
          const start = Date.now();
          const r = await Http.request({ method: 'GET', url: `https://${site}`, connectTimeout: 10000 });
          results.push({ site, success: true, statusCode: r.status, elapsed: (Date.now() - start) + 'ms' });
        } catch (e) {
          results.push({ site, success: false, error: e.message, hint: e.message });
        }
      }
      return results;
    },

    detectProxy: () => Promise.resolve({ found: false, proxy: null, message: '移动端使用系统 VPN 即可，无需手动配置代理' }),

    getHistory: () => storageGet('history'),
    getVersion: () => Promise.resolve({ version: '1.0.6' }),

    checkUpdate: async () => {
      try {
        const r = await Http.request({ method: 'GET', url: 'https://beedata-1251427456.cos.ap-beijing.myqcloud.com/version.json', connectTimeout: 10000 });
        const remote = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
        return { current: '1.0.6', remote: remote.version, hasUpdate: remote.version !== '1.0.6', changelog: remote.changelog || [], downloadUrl: remote.downloadUrl, error: null };
      } catch (e) { return { current: '1.0.6', remote: null, hasUpdate: false, changelog: [], downloadUrl: '', error: e.message }; }
    },

    doUpgrade: () => Promise.resolve({ success: false, error: '请在手机浏览器中手动下载更新' }),

    openFile: async (filepath) => {
      try { await Share.share({ title: 'Share file', url: filepath }); } catch {}
      return { success: true };
    },
    openHistoryFile: async (filename) => {
      try { await Share.share({ title: 'Open file', url: filename }); } catch {}
      return { success: true };
    },
    onFetchProgress: (cb) => { window._fetchProgressCB = cb; return cb; },
    offFetchProgress: () => { window._fetchProgressCB = null; },
  };
}

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
      items.push({ rank: idx + 1, title: show.name || '-', network: networks || '-', buzzScore: entry.value != null ? entry.value.toFixed(1) : '-', status: show.in_production ? '播出中' : '已完结' });
    });
  } catch {}
  return items;
}
