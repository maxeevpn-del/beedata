// Capacitor API bridge
(function() {
  const isCap = !!(window.Capacitor && window.Capacitor.Plugins);
  if (!isCap) return;

  try {
    const P = window.Capacitor.Plugins;
    const Filesystem = P.Filesystem;
    const Share = P.Share;
    const Http = window.CapacitorHttp || P.CapacitorHttp;

    if (!Http) { console.error('[bridge] CapacitorHttp plugin not found'); return; }

  async function httpGet(url, extraHeaders = {}) {
    const cfg = storageGet('config');
    const opts = {
      method: 'GET', url,
      headers: { 'User-Agent': 'BeeData/1.0', ...extraHeaders },
      connectTimeout: 15000, readTimeout: 30000,
    };
    if (cfg.proxy) {
      const u = cfg.proxy.replace(/^https?:\/\//, '');
      opts.proxy = { host: u.split(':')[0], port: parseInt(u.split(':')[1]) || 8080 };
    }
    const res = await Http.request(opts);
    return res.data;
  }

  async function httpGetText(url, extraHeaders = {}) {
    const cfg = storageGet('config');
    const opts = {
      method: 'GET', url,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...extraHeaders,
      },
      connectTimeout: 15000, readTimeout: 30000,
    };
    if (cfg.proxy) {
      opts.proxy = { host: cfg.proxy.replace(/^https?:\/\//, '').split(':')[0], port: parseInt(cfg.proxy.split(':').pop()) || 8080 };
    }
    const res = await Http.request(opts);
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
      // Try GitHub cache for default topic/week
      if (topicId === '47' && range === '7') {
        try {
          const cached = await httpGet('https://raw.githubusercontent.com/maxeevpn-del/beedata/master/dailyview-cache/latest.json');
          if (cached && cached.items && cached.items.length > 0) {
            return { success: true, count: cached.items.length, items: cached.items, cached: true };
          }
        } catch {}
      }
      // Live fallback
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
      // Try GitHub cache first
      const cacheUrls = [
        'https://raw.githubusercontent.com/maxeevpn-del/beedata/master/tvstats-cache/latest.json',
        'https://beedata-1251427456.cos.ap-beijing.myqcloud.com/tvstats-cache/latest.json',
      ];
      for (const cacheUrl of cacheUrls) {
        try {
          const cached = await httpGet(cacheUrl);
          if (cached && cached.items && cached.items.length > 0) {
            return { success: true, count: cached.items.length, items: cached.items, cached: true };
          }
        } catch {}
      }
      // Fallback to live fetch
      try {
        const url = `https://televisionstats.com/top/${date}`;
        const html = await httpGetText(url, { 'Accept-Language': 'en-US,en;q=0.9' });
        if (!html || html.length < 100) return { success: false, error: 'Empty response' };
        if (html.includes('Just a moment') || html.includes('cf-browser-verification')) return { success: false, error: 'Blocked by Cloudflare, using cached data if available' };
        if (!html.includes('__NEXT_DATA__')) return { success: false, error: 'No data. Use desktop version for latest' };
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
      await Filesystem.writeFile({ path: filename, data: base64, directory: Dir.Documents });
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
      await Filesystem.writeFile({ path: filename, data: base64, directory: Dir.Documents });
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
      const sites = ['baidu.com', 'dailyview.tw', 'televisionstats.com'];
      const results = [];
      for (const site of sites) {
        try {
          const start = Date.now();
          const r = await Http.request({ method: 'GET', url: `https://${site}`, connectTimeout: 8000, readTimeout: 8000 });
          results.push({ site, success: true, statusCode: r.status || 200, elapsed: (Date.now() - start) + 'ms' });
        } catch (e) {
          results.push({ site, success: false, error: e.message, hint: '连接失败' });
        }
      }
      return results;
    },

    detectProxy: () => Promise.resolve({ found: false, proxy: null, message: '移动端使用系�?VPN 即可，无需手动配置代理' }),

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

function parseDailyViewHTML(html) {
  const items = [];
  const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const blocks = clean.split(/(?=class="[^"]*ItemCard_rank_block[^"]*")/g).filter(b => b.includes('ItemCard_rank_block'));
  blocks.forEach(block => {
    if (block.length > 25000) return;
    const rankMatch = block.match(/ItemCard_ranking[^>]*>([^<]+)</);
    const rank = rankMatch ? parseInt(rankMatch[1].trim()) : 0;
    if (rank < 1 || rank > 100) return;
    const titleMatch = block.match(/ItemCard_item_title[^>]*>([^<]+)</);
    const title = titleMatch ? titleMatch[1].trim() : '';
    if (!title || title.length > 60) return;
    const text = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const vMatch = text.match(/�W·��\s*([\d,]+)\s*�P/);
    const volume = vMatch ? parseInt(vMatch[1].replace(/,/g, '')) : 0;
    const pos = text.match(/����\s*(\d+)\s*%/);
    const neu = text.match(/����\s*(\d+)\s*%/);
    const neg = text.match(/ؓ��\s*(\d+)\s*%/);
    let kw = '-';
    const km = text.match(/���T�P�I��\s*(.{1,50})/);
    if (km) { let r = km[1].trim(); const ti = r.search(/[0-9]|���|�ڱ�|������|�������g|ʲ�N��/); if (ti > 0) r = r.slice(0, ti).trim(); else if (ti === 0) r = ''; if (r.length > 0) kw = r; }
    items.push({ rank, title, volume, positive: pos ? pos[1]+'%' : '-', neutral: neu ? neu[1]+'%' : '-', negative: neg ? neg[1]+'%' : '-', keywords: kw });
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
      items.push({ rank: idx + 1, title: show.name || '-', network: networks || '-', buzzScore: entry.value != null ? entry.value.toFixed(1) : '-', status: show.in_production ? 'On Air' : 'Ended' });
    });
  } catch {}
  return items;
}

  } catch(e) { console.error('[bridge] init failed', e); }
})();



