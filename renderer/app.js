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
  document.querySelectorAll('.nav-item, .mobile-tab').forEach(item => {
    item.addEventListener('click', () => {
      const pageId = item.getAttribute('data-page');
      if (!pageId) return;

      document.querySelectorAll('.nav-item, .mobile-tab').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.nav-item[data-page="'+pageId+'"], .mobile-tab[data-page="'+pageId+'"]').forEach(n => n.classList.add('active'));

      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(pageId).classList.add('active');

      if (pageId === 'page-dashboard') loadDashboard();
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
  el.innerHTML = '检查中...';
  el.style.color = 'var(--warning)';
  try {
    const data = await window.electronAPI.checkUpdate();
    if (data.error) {
      showModal('检测失败', '无法连接更新服务器', data.error + '\n请检查网络或代理设置。', [{ label: '关闭', primary: true }]);
    } else if (data.hasUpdate) {
      const changelog = (data.changelog || []).map(l => `<div class="changelog-item">${escapeHtml(l)}</div>`).join('');
      showModal('发现新版本', `v${data.current} → v${data.remote}`, changelog, [
        { label: '取消', onClick: () => { el.style.color = 'var(--error)'; } },
        { label: '立即更新', primary: true, onClick: async () => {
          el.innerHTML = '下载中...';
          const upData = await window.electronAPI.doUpgrade();
          if (upData.success) {
            showModal('更新就绪', '', '安装包下载完成，程序即将退出。<br>请在弹出的安装向导中完成更新。', [
              { label: '确定', primary: true }
            ]);
          } else {
            showModal('下载失败', '', upData.error || '未知错误', [{ label: '关闭', primary: true }]);
          }
        }}
      ]);
    } else {
      showModal('已是最新版本', `v${data.current}`, '当前没有可用的更新。', [{ label: '好的', primary: true }]);
      el.style.color = 'var(--success)';
    }
  } catch (e) {
    showModal('检测失败', '', e.message, [{ label: '关闭', primary: true }]);
  }
  setTimeout(() => { el.innerHTML = orig; el.style.color = '#555f7a'; }, 2000);
}

// ========== 页面初始化 ==========
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  await loadProxyConfig();
  loadVersion();
  loadDashboard();

  // mobile: tap card to expand/collapse truncated text
  document.addEventListener('click', (e) => {
    if (window.innerWidth > 768) return;
    const td = e.target.closest('td');
    if (!td) return;
    const ex = td.style.overflow !== 'visible';
    td.style.whiteSpace = ex ? 'normal' : 'nowrap';
    td.style.overflow = ex ? 'visible' : 'hidden';
    td.style.textOverflow = ex ? 'unset' : 'ellipsis';
  });

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
    if (activePage && activePage.id === 'page-dailyview') { startFetch(); }
  }
});

function showModal(title, sub, body, actions) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalSub').textContent = sub || '';
  document.getElementById('modalBody').innerHTML = body || '';
  const ac = document.getElementById('modalActions');
  ac.innerHTML = '';
  (actions || []).forEach(a => {
    const btn = document.createElement('button');
    btn.className = a.primary ? 'btn btn-primary' : 'btn btn-cancel';
    btn.textContent = a.label;
    btn.onclick = () => { hideModal(); if (a.onClick) a.onClick(); };
    ac.appendChild(btn);
  });
  document.getElementById('modalOverlay').classList.add('show');
}
function hideModal() { document.getElementById('modalOverlay').classList.remove('show'); }
