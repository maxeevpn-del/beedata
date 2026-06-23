// ========== DailyView 抓取逻辑 ==========
let currentPage = 1, pageSize = window.innerWidth < 768 ? 500 : 10;

async function startFetch() {
  const btn = document.getElementById('btnFetch');
  btn.disabled = true;
  btn.textContent = '⏳ 抓取中...';

  const topicId = document.getElementById('topicId').value.trim() || '47';
  const range = document.getElementById('range').value;

  let totalSoFar = 0, pageCount = 0;
  setStatus('info', '<span class="spinner"></span>正在请求第 1 页...');

  const progressHandler = (d) => {
    pageCount = d.page;
    totalSoFar = d.runningTotal;
    setStatus('info', '<span class="spinner"></span>已抓取第 ' + d.page + ' 页（' + d.count + ' 条），累计 ' + totalSoFar + ' 条');
  };
  window.electronAPI.onFetchProgress(progressHandler);
  try {
    const data = await window.electronAPI.fetch({
      topicId, range,
      proxy: getProxyUrl(),
      proxyType: getProxyType(),
    });
    window.electronAPI.offFetchProgress(progressHandler);
    if (data.success) {
      fetchedData = data.items;
      document.getElementById('emptyCard').style.display = 'none';
      document.getElementById('dataCard').style.display = 'block';
      renderTable(data.items, topicId, range);
      setStatus('success', '✅ 成功！共 ' + data.count + ' 条抓取完成');
    }
  } catch (e) {
    window.electronAPI.offFetchProgress(progressHandler);
    setStatus('error', '❌ 抓取失败: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 抓取数据';
  }
}

function renderItemRow(item) {
  return `
    <tr>
      <td style="text-align:center;"><span class="rank-badge ${getRankClass(item.rank)}">${item.rank}</span></td>
      <td>${escapeHtml(item.title || '-')}</td>
      <td style="text-align:center;">${item.volume ? item.volume.toLocaleString() : '-'}</td>
      <td style="text-align:center;">${escapeHtml(item.positive || '-')}</td>
      <td style="text-align:center;">${escapeHtml(item.neutral || '-')}</td>
      <td style="text-align:center;">${escapeHtml(item.negative || '-')}</td>
      <td style="font-size:12px; color:#666;">${escapeHtml(item.keywords || '-')}</td>
    </tr>`;
}

function renderPage(page) {
  const tbody = document.getElementById('tableBody');
  const start = (page - 1) * pageSize;
  const pageItems = fetchedData.slice(start, start + pageSize);
  tbody.innerHTML = pageItems.map(renderItemRow).join('');
  renderPagination();
}

function renderPagination() {
  const totalPages = Math.ceil(fetchedData.length / pageSize);
  const pg = document.getElementById('pagination');
  if (fetchedData.length <= 10) { pg.innerHTML = ''; return; }

  let html = `<span style="font-size:13px;color:var(--text-secondary);">第 ${currentPage}/${totalPages} 页</span>`;
  html += `<button class="btn btn-outline btn-sm" onclick="goPage(1)" ${currentPage===1?'disabled':''}>«</button>`;
  html += `<button class="btn btn-outline btn-sm" onclick="goPage(${currentPage-1})" ${currentPage===1?'disabled':''}>‹</button>`;
  html += `<button class="btn btn-outline btn-sm" onclick="goPage(${currentPage+1})" ${currentPage===totalPages?'disabled':''}>›</button>`;
  html += `<button class="btn btn-outline btn-sm" onclick="goPage(${totalPages})" ${currentPage===totalPages?'disabled':''}>»</button>`;
  html += `<select style="height:30px;font-size:13px;margin-left:6px;border:1px solid var(--border);border-radius:4px;padding:0 4px;" onchange="setPageSize(this.value)">`;
  [10, 20, 30, 50].forEach(n => {
    html += `<option value="${n}" ${pageSize===n?'selected':''}>${n} 条/页</option>`;
  });
  html += `</select>`;
  pg.innerHTML = html;
}

function setPageSize(size) {
  pageSize = parseInt(size);
  currentPage = 1;
  renderPage(1);
}

function goPage(p) {
  const total = Math.ceil(fetchedData.length / pageSize);
  if (p < 1 || p > total) return;
  currentPage = p;
  renderPage(p);
}

function renderTable(items, topicId, range) {
  fetchedData = items;
  currentPage = 1;
  const summary = document.getElementById('dataSummary');
  const rangeLabel = { '1': '今日', '7': '本周', '30': '本月' }[range] || '自定义';
  const topicLabel = getTopicName(topicId);
  summary.innerHTML = `
    <div class="summary-item"><div class="num">${items.length}</div><div class="label">数据条数</div></div>
    <div class="summary-item"><div class="num">${topicLabel}</div><div class="label">话题分类</div></div>
    <div class="summary-item"><div class="num">${rangeLabel}</div><div class="label">时间范围</div></div>
  `;

  if (items.length === 0) {
    document.getElementById('tableBody').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#aaa;">暂无数据</td></tr>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  renderPage(1);
}

async function exportData() {
  if (fetchedData.length === 0) { setStatus('error', '❌ 没有数据可导出'); return; }

  const btn = document.getElementById('btnExport');
  btn.disabled = true;
  btn.textContent = '⏳ 导出中...';

  const topicId = document.getElementById('topicId').value.trim() || '47';
  const range = document.getElementById('range').value;

  try {
    const result = await window.electronAPI.exportExcel({ items: fetchedData, topicId, range });
    if (result.success) {
      setStatus('success', `✅ Excel 已保存<br>📁 ${result.filename}<br>📌 ${result.filepath}`);
      if (window.electronAPI.openFile) window.electronAPI.openFile(result.filepath);
    } else {
      setStatus('error', '❌ 导出失败: ' + result.error);
    }
  } catch (e) {
    setStatus('error', '❌ 导出请求失败: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '📥 导出 Excel';
  }
}

function clearAll() {
  fetchedData = [];
  document.getElementById('tableBody').innerHTML = '';
  document.getElementById('dataSummary').innerHTML = '';
  document.getElementById('dataCard').style.display = 'none';
  document.getElementById('emptyCard').style.display = 'block';
  clearStatus();
}

function previewPrint() { window.print(); }
