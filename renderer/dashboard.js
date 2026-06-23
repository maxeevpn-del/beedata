async function loadDashboard() {
  loadDashboardStats();
  loadDashboardSources();
  loadDashboardRecent();
}

async function loadDashboardStats() {
  try {
    const history = await window.electronAPI.getHistory();
    const fetches = history.filter(r => r.type === 'fetch' && r.status === 'success');
    const exports = history.filter(r => r.type === 'export' && r.status === 'success');
    const last = history[0];
    const lastTime = last ? formatTime(last.time) : '-';
    document.getElementById('dashStats').innerHTML = `
      <div class="stat-card">
        <div class="stat-icon" style="background:#eff2ff;color:var(--primary);">🔍</div>
        <div class="stat-info"><div class="num">${fetches.length}</div><div class="label">成功抓取</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:#ecfdf5;color:var(--success);">📥</div>
        <div class="stat-info"><div class="num">${exports.length}</div><div class="label">成功导出</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:#fffbeb;color:var(--warning);">📊</div>
        <div class="stat-info"><div class="num">${history.length}</div><div class="label">总记录</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:#f5f3ff;color:#8b5cf6;">🕐</div>
        <div class="stat-info"><div class="num" style="font-size:15px;">${lastTime}</div><div class="label">最近活动</div></div>
      </div>`;
  } catch (e) { /* ignore */ }
}

function loadDashboardSources() {
  document.getElementById('dashSources').innerHTML = `
    <div class="source-card" onclick="navigateTo('page-dailyview')">
      <div class="source-header">
        <div class="source-icon" style="background:#eff2ff;color:var(--primary);">📈</div>
        <div class="source-name">DailyView 周榜</div>
      </div>
      <div class="source-desc">抓取 dailyview.tw 话题排行榜数据，支持60+话题分类，可按日/周/月查看，含情绪分布与热门关键字分析。</div>
      <div class="source-meta">
        <span>🌐 dailyview.tw</span><span>📊 排行榜</span><span>📋 Excel 导出</span>
      </div>
    </div>
    <div class="source-card" onclick="navigateTo('page-tvstats')">
      <div class="source-header">
        <div class="source-icon" style="background:#ecfdf5;color:var(--success);">📺</div>
        <div class="source-name">TV Stats 排行</div>
      </div>
      <div class="source-desc">抓取 televisionstats.com 全球电视剧热度日榜，每日更新 TOP 100 剧集排名、平台分布及播出状态。</div>
      <div class="source-meta">
        <span>🌐 televisionstats.com</span><span>🔥 热度排行</span><span>📋 Excel 导出</span>
      </div>
    </div>`;
}

async function loadDashboardRecent() {
  try {
    const history = await window.electronAPI.getHistory();
    const recent = history.slice(0, 8);
    const tbody = document.getElementById('dashRecent');
    if (recent.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">暂无记录</td></tr>';
      return;
    }
    const rangeMap = { '1': '今日', '7': '本周', '30': '本月' };
    tbody.innerHTML = recent.map(r => {
      const typeLabel = r.type === 'fetch' ? '🔍 抓取' : r.type === 'export' ? '📥 导出' : r.type;
      const statusIcon = r.status === 'success' ? '✅' : '❌';
      const detail = r.topicId ? ('#' + r.topicId + ' ' + (rangeMap[r.range] || r.range || '')) : (r.date || '-');
      return `<tr>
        <td style="text-align:center;">${typeLabel}</td>
        <td style="text-align:center;">${r.source || '-'}</td>
        <td style="text-align:center;font-size:12px;color:var(--text-muted);">${formatTime(r.time)}</td>
        <td style="text-align:center;">${r.count || 0}</td>
        <td style="text-align:center;">${statusIcon}</td>
      </tr>`;
    }).join('');
  } catch (e) { /* ignore */ }
}

function navigateTo(pageId) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const nav = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  if (nav) nav.classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
  if (pageId === 'page-settings') refreshSettingsPage();
  if (pageId === 'page-history') loadHistoryPage();
}

function formatTime(iso) {
  const t = new Date(iso);
  return `${t.getMonth()+1}/${t.getDate()} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
}
