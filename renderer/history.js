// ========== 历史记录页面 ==========
async function loadHistoryPage() {
  try {
    const history = await window.electronAPI.getHistory();
    const tbody = document.getElementById('historyBody');
    if (history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:#aaa;">暂无记录</td></tr>';
      return;
    }
    const rangeMap = { '1': '今日', '7': '本周', '30': '本月' };
    tbody.innerHTML = history.map(r => {
      const time = new Date(r.time);
      const ts = `${time.getMonth()+1}/${time.getDate()} ${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}`;
      const typeLabel = r.type === 'fetch' ? '🔍 抓取' : r.type === 'export' ? '📥 导出' : r.type;
      const statusColor = r.status === 'success' ? 'color:var(--success);' : 'color:var(--error);';
      const rangeLabel = rangeMap[r.range] || r.range || '-';
      const ops = [];
      if (r.type === 'export' && r.filename) {
        ops.push(`<a href="#" onclick="window.electronAPI.openHistoryFile('${r.filename}')" style="font-size:12px;color:var(--primary);text-decoration:none;">⬇下载</a>`);
      }
      return `<tr>
        <td style="text-align:center;">${typeLabel}</td>
        <td style="text-align:center;">${ts}</td>
        <td style="text-align:center;">${r.source || '-'}</td>
        <td style="text-align:center;">#${r.topicId || '-'} ${rangeLabel}</td>
        <td style="text-align:center;">${r.count || 0}</td>
        <td style="text-align:center;${statusColor}">${r.status === 'success' ? '✅' : '❌'}</td>
        <td style="text-align:center;">${ops.join(' ')}</td>
      </tr>`;
    }).join('');
  } catch (e) { /* ignore */ }
}
