const axios = require('axios');
const fs = require('fs');
const path = require('path');
const COS = require('cos-nodejs-sdk-v5');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '_cos-config.json'), 'utf-8'));
const cos = new COS({ SecretId: cfg.SecretId, SecretKey: cfg.SecretKey });

let proxyAgent = null;
try {
  const pc = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));
  if (pc.proxy) proxyAgent = pc.proxyType === 'socks5' ? new SocksProxyAgent(pc.proxy) : new HttpsProxyAgent(pc.proxy);
} catch {}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function fetchTVStats(dateStr) {
  const url = `https://televisionstats.com/top/${dateStr}`;
  const opts = { timeout: 30000, headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } };
  if (proxyAgent) { opts.httpsAgent = proxyAgent; opts.proxy = false; }
  const res = await axios.get(url, opts);
  const html = res.data;
  const match = html.match(/__NEXT_DATA__"[^>]*>([^<]+)</);
  if (!match) throw new Error('NEXT_DATA not found');
  const data = JSON.parse(match[1]);
  const shows = data.props.pageProps.shows;
  if (!Array.isArray(shows) || shows.length === 0) return null;
  return shows.map((entry, idx) => {
    const show = entry.show || {};
    return {
      rank: idx + 1,
      title: show.name || '-',
      network: (show.networks || []).map(n => n.name).join(', ') || '-',
      buzzScore: entry.value != null ? entry.value.toFixed(1) : '-',
      status: show.in_production ? 'On Air' : 'Ended',
    };
  });
}

function uploadJSON(key, body) {
  return new Promise((resolve, reject) => {
    cos.putObject({ Bucket: cfg.Bucket, Region: cfg.Region, Key: 'tvstats-cache/' + key, Body: JSON.stringify(body), ACL: 'public-read' }, (err) => {
      if (err) reject(err); else resolve();
    });
  });
}

(async () => {
  for (let offset = 1; offset <= 3; offset++) {
    const d = new Date(Date.now() - offset * 86400000);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    console.log('Try', dateStr);
    const items = await fetchTVStats(dateStr);
    if (items && items.length > 0) {
      console.log('Got', items.length, 'items');
      await uploadJSON('latest.json', { date: dateStr, items });
      await uploadJSON(dateStr + '.json', { date: dateStr, items });
      console.log('Uploaded latest + ' + dateStr);
      return;
    }
    console.log('  empty, trying previous day...');
  }
  console.log('No data found');
})();
