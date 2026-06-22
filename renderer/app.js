// ========== 全局状态 ==========
let globalProxy = { url: '', type: 'http' };
let fetchedData = [];
let topicList = [];
let lastExportFile = '';

// ========== 工具函数 ==========
function getTopicName(topicId) {
  const t = topicList.find(x => x.id === String(topicId));
  return t ? t.name : `话题 #${topicId}`;
}

function setStatus(type, msg) {
  const bar = document.getElementById('statusBar');
  bar.className = 'status-bar ' + type;
  bar.innerHTML = msg;
}

function clearStatus() {
  const bar = document.getElementById('statusBar');
  bar.className = 'status-bar';
  bar.innerHTML = '';
}

function getRankClass(rank) {
  if (rank === 1) return 'rank-1';
  if (rank === 2) return 'rank-2';
  if (rank === 3) return 'rank-3';
  if (rank <= 10) return 'rank-4-10';
  return '';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ========== 导航 ==========
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      const pageId = item.getAttribute('data-page');
      document.getElementById(pageId).classList.add('active');
      if (pageId === 'page-settings') refreshSettingsPage();
      if (pageId === 'page-history') loadHistoryPage();
    });
  });
}

// ========== 代理管理 ==========
async function loadProxyConfig() {
  try {
    const cfg = await window.electronAPI.getConfig();
    globalProxy.url = cfg.proxy || '';
    globalProxy.type = cfg.proxyType || 'http';
    updateProxyIndicator();
  } catch (e) { /* ignore */ }
}

async function saveProxyConfig(url, type) {
  globalProxy.url = url;
  globalProxy.type = type;
  await window.electronAPI.saveConfig({ proxy: url, proxyType: type });
  updateProxyIndicator();
}

function updateProxyIndicator() {
  const el = document.getElementById('proxyIndicator');
  if (globalProxy.url) {
    el.className = 'proxy-indicator on';
    el.innerHTML = '🟢 代理已配置';
  } else {
    el.className = 'proxy-indicator off';
    el.innerHTML = '⚫ 未配置代理';
  }
}

function getProxyUrl() { return globalProxy.url; }
function getProxyType() { return globalProxy.type; }

// ========== 版本检查 ==========
async function loadVersion() {
  try {
    const v = await window.electronAPI.getVersion();
    const ver = v.version || '1.0.0';
    document.getElementById('versionNum').textContent = ver;
    const titleEl = document.getElementById('titleVersion');
    if (titleEl) titleEl.textContent = ver;
    const badgeEl = document.getElementById('titleBadge');
    if (badgeEl) badgeEl.textContent = 'v' + ver;
  } catch (e) { /* ignore */ }
}

async function checkUpdate() {
  const el = document.getElementById('sidebarVersion');
  const orig = el.innerHTML;
  el.innerHTML = 'Checking...';
  el.style.color = 'var(--warning)';
  try {
    const data = await window.electronAPI.checkUpdate();
    if (data.hasUpdate) {
      const changelog = (data.changelog || []).map(l => '  • ' + l).join('\n');
      const doUpdate = confirm(
        `发现新版本 v${data.remote}\n当前版本: v${data.current}\n\n更新内容:\n${changelog || '无'}\n\n点击确定开始下载更新`
      );
      if (doUpdate) {
        el.innerHTML = 'Downloading...';
        const upData = await window.electronAPI.doUpgrade();
        if (upData.success) {
          alert('安装包下载完成，程序即将退出。请在弹出的安装向导中完成更新。');
        } else {
          alert('下载失败: ' + (upData.error || 'unknown'));
        }
      }
      el.style.color = 'var(--error)';
    } else {
      alert('当前已是最新版本 v' + data.current);
      el.style.color = 'var(--success)';
    }
  } catch (e) {
    alert('检测更新失败: ' + e.message);
  }
  setTimeout(() => { el.innerHTML = orig; el.style.color = '#ccc'; }, 2000);
}

// ========== 页面初始化 ==========
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  await loadProxyConfig();
  loadVersion();

  try {
    topicList = await window.electronAPI.getTopics();
    const select = document.getElementById('topicId');
    select.innerHTML = topicList.map(t =>
      `<option value="${t.id}" ${t.id === '47' ? 'selected' : ''}>${t.id} - ${t.name}</option>`
    ).join('');
  } catch (e) {
    console.error('加载话题列表失败', e);
  }

  const tvDateEl = document.getElementById('tvDate');
  if (tvDateEl) {
    const d = new Date(Date.now() - 86400000);
    tvDateEl.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
    e.preventDefault();
    const activePage = document.querySelector('.page.active');
    if (activePage && activePage.id === 'page-dailyview') {
      startFetch();
    }
  }
});
