(function() {
  var isCap = !!(window.Capacitor && window.Capacitor.Plugins);
  if (!isCap) return;

  try {
    var P = window.Capacitor.Plugins;
    var Filesystem = P.Filesystem;
    var Share = P.Share;
    var Http = window.CapacitorHttp || P.CapacitorHttp;
    if (!Http) { console.error('[bridge] CapacitorHttp plugin not found'); return; }
    var DirEnum = Filesystem ? (Filesystem.Directory || { Documents: 0, Data: 1, Cache: 2 }) : { Documents: 0 };

    function httpGet(url, h) {
      var cfg = JSON.parse(localStorage.getItem('beedata_config') || '{}');
      var opts = { method: 'GET', url: url, headers: Object.assign({ 'User-Agent': 'BeeData/1.0' }, h || {}), connectTimeout: 15000, readTimeout: 30000 };
      if (cfg.proxy) { var u = cfg.proxy.replace(/^https?:\/\//, ''); opts.proxy = { host: u.split(':')[0], port: parseInt(u.split(':')[1]) || 8080 }; }
      return Http.request(opts).then(function(r) {
        var d = r.data;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch(e) {} }
        return d;
      });
    }

    function httpGetText(url, h) {
      var cfg = JSON.parse(localStorage.getItem('beedata_config') || '{}');
      var opts = { method: 'GET', url: url, headers: Object.assign({ 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36', 'Accept': 'text/html' }, h || {}), connectTimeout: 15000, readTimeout: 30000 };
      if (cfg.proxy) { var u = cfg.proxy.replace(/^https?:\/\//, ''); opts.proxy = { host: u.split(':')[0], port: parseInt(u.split(':')[1]) || 8080 }; }
      return Http.request(opts).then(function(r) {
        if (typeof r.data === 'string') return r.data;
        return String(r.data);
      });
    }

    function storageGet(k) { try { return JSON.parse(localStorage.getItem('beedata_' + k) || '{}'); } catch(e) { return {}; } }
    function storageSet(k, v) { localStorage.setItem('beedata_' + k, JSON.stringify(v)); }

    window.electronAPI = {
      fetch: function(params) {
        var topicId = params.topicId || '47', range = params.range || '7', all = [];
        function fetchPage(p) {
          return httpGetText('https://dailyview.tw/top100/topic/' + topicId + '?range=' + range + '&page=' + p, { 'Accept-Language': 'zh-TW' }).then(function(html) {
            var items = parseDailyViewHTML(html);
            if (!items.length) return;
            all.push.apply(all, items);
            if (p < 10) { return new Promise(function(r) { setTimeout(r, 500); }).then(function() { return fetchPage(p + 1); }); }
          });
        }
        return fetchPage(1).then(function() { return { success: true, count: all.length, items: all }; });
      },

      tvFetch: function(params) {
        var date = params.date;
        var cacheUrls = [
          'https://beedata-1251427456.cos.ap-beijing.myqcloud.com/tvstats-cache/latest.json',
          'https://raw.githubusercontent.com/maxeevpn-del/beedata/master/tvstats-cache/latest.json'
        ];

        function tryCache(i) {
          if (i >= cacheUrls.length) return httpGetText('https://televisionstats.com/top/' + date, { 'Accept-Language': 'en-US' }).then(function(html) {
            return { success: true, count: parseTVStatsHTML(html).length, items: parseTVStatsHTML(html) };
          });
          return httpGet(cacheUrls[i]).then(function(cached) {
            if (cached && cached.items && cached.items.length) return { success: true, count: cached.items.length, items: cached.items, cached: true };
            return tryCache(i + 1);
          });
        }

        return tryCache(0).catch(function(e) {
          return { success: false, error: 'Fetch failed: ' + (e.message || 'unknown') };
        });
      },

      exportExcel: function(params) {
        var items = params.items, topicId = params.topicId, wb = new window.ExcelJS.Workbook(), ws = wb.addWorksheet('data');
        ws.columns = [{ header: 'rank', key: 'rank', width: 6 }, { header: 'title', key: 'title', width: 40 }, { header: 'volume', key: 'volume', width: 12 }, { header: 'positive', key: 'positive', width: 8 }, { header: 'neutral', key: 'neutral', width: 8 }, { header: 'negative', key: 'negative', width: 8 }, { header: 'keywords', key: 'keywords', width: 30 }];
        items.forEach(function(i) { ws.addRow(i); });
        return wb.xlsx.writeBuffer().then(function(buf) {
          var b64 = btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
          var d = new Date();
          var fn = 'dailyview_' + topicId + '_' + (d.getMonth()+1) + d.getDate() + '_' + d.getHours() + d.getMinutes() + '.xlsx';
          return Filesystem.mkdir({ path: '', directory: DirEnum.Documents, recursive: true }).then(function() {
            return Filesystem.writeFile({ path: fn, data: b64, directory: DirEnum.Documents, recursive: true }).then(function() { return { success: true, filename: fn }; });
          });
        });
      },

      tvExport: function(params) {
        var items = params.items, date = params.date, wb = new window.ExcelJS.Workbook(), ws = wb.addWorksheet('data');
        ws.columns = [{ header: 'rank', key: 'rank', width: 6 }, { header: 'title', key: 'title', width: 40 }, { header: 'network', key: 'network', width: 20 }, { header: 'buzzScore', key: 'buzzScore', width: 10 }, { header: 'status', key: 'status', width: 10 }];
        items.forEach(function(i) { ws.addRow(i); });
        return wb.xlsx.writeBuffer().then(function(buf) {
          var b64 = btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
          var fn = 'tvstats_' + date + '.xlsx';
          return Filesystem.mkdir({ path: '', directory: DirEnum.Documents, recursive: true }).then(function() {
            return Filesystem.writeFile({ path: fn, data: b64, directory: DirEnum.Documents, recursive: true }).then(function() { return { success: true, filename: fn }; });
          });
        });
      },

      getTopics: function() {
        return httpGetText('https://dailyview.tw/top100', { 'Accept-Language': 'zh-TW' }).then(function(html) {
          var topics = [], re = /\/top100\/topic\/(\d+)/g, m;
          while ((m = re.exec(html)) !== null) { if (!topics.find(function(t) { return t.id === m[1]; })) topics.push({ id: m[1], name: '' }); }
          return topics.length ? topics : [{ id: '47', name: 'entertainment' }];
        }).catch(function() { return [{ id: '47', name: 'entertainment' }]; });
      },

      getConfig: function() { return storageGet('config'); },
      saveConfig: function(p) { storageSet('config', p); return { success: true }; },

      testProxy: function(params) {
        var sites = ['baidu.com', 'dailyview.tw', 'televisionstats.com'], results = [], promises = sites.map(function(site) {
          return Http.request({ method: 'GET', url: 'https://' + site, connectTimeout: 8000, readTimeout: 8000 }).then(function(r) {
            results.push({ site: site, success: true, statusCode: r.status || 200, elapsed: '' });
          }).catch(function(e) {
            results.push({ site: site, success: false, error: e.message, hint: 'Failed' });
          });
        });
        return Promise.all(promises).then(function() { return results; });
      },

      detectProxy: function() { return Promise.resolve({ found: false, proxy: null, message: 'Use system VPN, no proxy needed' }); },
      getHistory: function() { return storageGet('history'); },
      getVersion: function() { return Promise.resolve({ version: '1.0.6' }); },

      checkUpdate: function() {
        return Http.request({ method: 'GET', url: 'https://beedata-1251427456.cos.ap-beijing.myqcloud.com/version.json', connectTimeout: 10000 }).then(function(r) {
          var remote = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
          return { current: '1.0.6', remote: remote.version, hasUpdate: remote.version !== '1.0.6', changelog: remote.changelog || [], downloadUrl: remote.downloadUrl, error: null };
        }).catch(function(e) { return { current: '1.0.6', remote: null, hasUpdate: false, error: e.message }; });
      },

      doUpgrade: function() { return Promise.resolve({ success: false, error: 'Please update manually in browser' }); },

      openFile: function(filepath) {
        return Share.share({ title: 'Share file', url: filepath }).catch(function() {}).then(function() { return { success: true }; });
      },
      openHistoryFile: function(filename) {
        return Share.share({ title: 'Open file', url: filename }).catch(function() {}).then(function() { return { success: true }; });
      },

      onFetchProgress: function(cb) { window._fetchProgressCB = cb; return cb; },
      offFetchProgress: function() { window._fetchProgressCB = null; },
    };
  } catch(e) { console.error('[bridge]', e); }
})();

function parseDailyViewHTML(html) {
  var items = [];
  var clean = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  var blocks = clean.split(/(?=class="[^"]*ItemCard_rank_block[^"]*")/g).filter(function(b) { return b.includes('ItemCard_rank_block'); });
  blocks.forEach(function(block) {
    if (block.length > 25000) return;
    var rm = block.match(/ItemCard_ranking[^>]*>([^<]+)</);
    var rank = rm ? parseInt(rm[1].trim()) : 0;
    if (rank < 1 || rank > 100) return;
    var tm = block.match(/ItemCard_item_title[^>]*>([^<]+)</);
    var title = tm ? tm[1].trim() : '';
    if (!title || title.length > 60) return;
    var text = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    var vol = 0;
    var vm = text.match(/([\d,]+)\s*\u7B46/);
    if (vm) vol = parseInt(vm[1].replace(/,/g, ''));
    var pm = text.match(/\u6B63\u9762\s*(\d+)\s*%/);
    var nm = text.match(/\u4E2D\u7ACB\s*(\d+)\s*%/);
    var gm = text.match(/\u8CA0\u9762\s*(\d+)\s*%/);
    var kw = '-';
    var km = text.match(/\u71B1\u9580\u95DC\u9375\u5B57\s*(.{1,50})/);
    if (km) { var r = km[1].trim(); var ti = r.search(/[0-9]|\u9996\u9801|\u53E3\u7891|\u8072\u91CF\u6392\u884C|\u5206\u6790\u671F\u9593|\u4EC0\u9EBC\u662F/); if (ti > 0) r = r.slice(0, ti).trim(); else if (ti === 0) r = ''; if (r.length > 0) kw = r; }
    items.push({ rank: rank, title: title, volume: vol, positive: pm ? pm[1]+'%' : '-', neutral: nm ? nm[1]+'%' : '-', negative: gm ? gm[1]+'%' : '-', keywords: kw });
  });
  return items;
}

function parseTVStatsHTML(html) {
  var items = [];
  try {
    var m = html.match(/__NEXT_DATA__"[^>]*>([^<]+)</);
    if (!m) return items;
    var data = JSON.parse(m[1]);
    var shows = data.props.pageProps.shows;
    if (!Array.isArray(shows)) return items;
    shows.forEach(function(entry, idx) {
      var show = entry.show || {};
      var networks = (show.networks || []).map(function(n) { return n.name; }).join(', ');
      items.push({ rank: idx + 1, title: show.name || '-', network: networks || '-', buzzScore: entry.value != null ? entry.value.toFixed(1) : '-', status: show.in_production ? 'On Air' : 'Ended' });
    });
  } catch(e) {}
  return items;
}
