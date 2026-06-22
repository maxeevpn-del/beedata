// ========== TV Stats 抓取逻辑 ==========
let tvData = [];
let tvCurrentPage = 1, tvPageSize = 10;

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getYesterdayStr() {
  const d = new Date(Date.now() - 86400000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function startTVFetch() {
  const btn = document.getElementById('btnTVFetch');
  btn.disabled = true;
  btn.textContent = '⏳ 抓取中...';

  const date = document.getElementById('tvDate').value || getYesterdayStr();
  document.getElementById('tvStatusBar').className = 'status-bar info';
  document.getElementById('tvStatusBar').innerHTML = '<span class="spinner"></span>正在抓取 ' + date + ' 的排行数据...';

  try {
    const data = await window.electronAPI.tvFetch({
      date,
      proxy: getProxyUrl(),
      proxyType: getProxyType(),
    });
    if (data.success) {
      tvData = data.items;
      document.getElementById('tvEmptyCard').style.display = 'none';
      document.getElementById('tvDataCard').style.display = 'block';
      renderTVTable(data.items, date);
      document.getElementById('tvStatusBar').className = 'status-bar success';
      document.getElementById('tvStatusBar').innerHTML = '✅ 成功！共 ' + data.count + ' 条';
    } else {
      document.getElementById('tvStatusBar').className = 'status-bar error';
      document.getElementById('tvStatusBar').innerHTML = '❌ ' + (data.error || '抓取失败');
    }
  } catch (e) {
    document.getElementById('tvStatusBar').className = 'status-bar error';
    document.getElementById('tvStatusBar').innerHTML = '❌ 抓取失败: ' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 抓取数据';
  }
}

function renderTVItemRow(item) {
  return `
    <tr>
      <td style="text-align:center;"><span class="rank-badge ${getRankClass(item.rank)}">${item.rank}</span></td>
      <td>${escapeHtml(item.title || '-')}</td>
      <td style="text-align:center;">${escapeHtml(item.network || '-')}</td>
      <td style="text-align:center;font-weight:600;">${item.buzzScore}</td>
      <td style="text-align:center;font-size:12px;">${item.status}</td>
    </tr>`;
}

function renderTVPage(page) {
  const tbody = document.getElementById('tvTableBody');
  const start = (page - 1) * tvPageSize;
  const pageItems = tvData.slice(start, start + tvPageSize);
  tbody.innerHTML = pageItems.map(renderTVItemRow).join('');
  renderTVPagination();
}

function renderTVPagination() {
  const totalPages = Math.ceil(tvData.length / tvPageSize);
  const pg = document.getElementById('tvPagination');
  if (tvData.length <= 10) { pg.innerHTML = ''; return; }

  let html = `<span style="font-size:13px;color:var(--text-secondary);">第 ${tvCurrentPage}/${totalPages} 页</span>`;
  html += `<button class="btn btn-outline btn-sm" onclick="tvGoPage(1)" ${tvCurrentPage===1?'disabled':''}>«</button>`;
  html += `<button class="btn btn-outline btn-sm" onclick="tvGoPage(${tvCurrentPage-1})" ${tvCurrentPage===1?'disabled':''}>‹</button>`;
  html += `<button class="btn btn-outline btn-sm" onclick="tvGoPage(${tvCurrentPage+1})" ${tvCurrentPage===totalPages?'disabled':''}>›</button>`;
  html += `<button class="btn btn-outline btn-sm" onclick="tvGoPage(${totalPages})" ${tvCurrentPage===totalPages?'disabled':''}>»</button>`;
  html += `<select style="height:30px;font-size:13px;margin-left:6px;border:1px solid var(--border);border-radius:4px;padding:0 4px;" onchange="tvSetPageSize(this.value)">`;
  [10, 20, 30, 50].forEach(n => {
    html += `<option value="${n}" ${tvPageSize===n?'selected':''}>${n} 条/页</option>`;
  });
  html += `</select>`;
  pg.innerHTML = html;
}

function tvSetPageSize(size) {
  tvPageSize = parseInt(size);
  tvCurrentPage = 1;
  renderTVPage(1);
}

function tvGoPage(p) {
  const total = Math.ceil(tvData.length / tvPageSize);
  if (p < 1 || p > total) return;
  tvCurrentPage = p;
  renderTVPage(p);
}

function renderTVTable(items, date) {
  tvData = items;
  tvCurrentPage = 1;
  document.getElementById('tvDataSummary').innerHTML = `
    <div class="summary-item"><div class="num">${items.length}</div><div class="label">数据条数</div></div>
    <div class="summary-item"><div class="num">${date}</div><div class="label">日期</div></div>
    <div class="summary-item"><div class="num">Television Stats</div><div class="label">数据源</div></div>
  `;

  if (items.length === 0) {
    document.getElementById('tvTableBody').innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#aaa;">暂无数据</td></tr>';
    document.getElementById('tvPagination').innerHTML = '';
    return;
  }

  renderTVPage(1);
}

async function exportTVData() {
  if (tvData.length === 0) {
    document.getElementById('tvStatusBar').className = 'status-bar error';
    document.getElementById('tvStatusBar').innerHTML = '❌ 没有数据可导出';
    return;
  }

  const btn = document.getElementById('btnTVExport');
  btn.disabled = true;
  btn.textContent = '⏳ 导出中...';

  const date = document.getElementById('tvDate').value || getYesterdayStr();

  try {
    const result = await window.electronAPI.tvExport({ items: tvData, date });
    if (result.success) {
      document.getElementById('tvStatusBar').className = 'status-bar success';
      document.getElementById('tvStatusBar').innerHTML = `✅ Excel 已保存<br>📁 ${result.filename}<br>📌 ${result.filepath}`;
      if (window.electronAPI.openFile) window.electronAPI.openFile(result.filepath);
    } else {
      document.getElementById('tvStatusBar').className = 'status-bar error';
      document.getElementById('tvStatusBar').innerHTML = '❌ 导出失败: ' + result.error;
    }
  } catch (e) {
    document.getElementById('tvStatusBar').className = 'status-bar error';
    document.getElementById('tvStatusBar').innerHTML = '❌ 导出请求失败: ' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '📥 导出 Excel';
  }
}

function clearTVAll() {
  tvData = [];
  document.getElementById('tvTableBody').innerHTML = '';
  document.getElementById('tvDataSummary').innerHTML = '';
  document.getElementById('tvDataCard').style.display = 'none';
  document.getElementById('tvEmptyCard').style.display = 'block';
  document.getElementById('tvStatusBar').className = 'status-bar';
  document.getElementById('tvStatusBar').innerHTML = '';
}
