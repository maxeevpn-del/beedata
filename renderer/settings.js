// ========== 设置页面逻辑 ==========
function refreshSettingsPage() {
  document.getElementById('settingsProxyUrl').value = globalProxy.url;
  document.getElementById('settingsProxyType').value = globalProxy.type;
  document.getElementById('testResult').textContent = '';
}

async function saveAndApplyProxy() {
  const url = document.getElementById('settingsProxyUrl').value.trim();
  const type = document.getElementById('settingsProxyType').value;
  try {
    await saveProxyConfig(url, type);
    document.getElementById('testResult').className = 'test-result ok';
    document.getElementById('testResult').textContent = '✅ 已保存';
    setTimeout(() => { document.getElementById('testResult').textContent = ''; }, 2000);
    refreshSettingsPage();
  } catch (e) {
    document.getElementById('testResult').className = 'test-result fail';
    document.getElementById('testResult').textContent = '❌ 保存失败';
  }
}

async function testProxy() {
  const url = document.getElementById('settingsProxyUrl').value.trim();
  const type = document.getElementById('settingsProxyType').value;
  const el = document.getElementById('testResult');
  const log = document.getElementById('connectionLog');

  if (!url) {
    el.className = 'test-result fail';
    el.textContent = '❌ 请先输入代理地址';
    return;
  }

  el.className = 'test-result testing';
  el.textContent = '⏳ 正在测试 dailyview.tw / televisionstats.com ...';
  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

  try {
    const results = await window.electronAPI.testProxy({ proxy: url, proxyType: type });
    const allOk = results.every(r => r.success);
    if (allOk) {
      el.className = 'test-result ok';
      el.textContent = `✅ 全部通过 (${results.map(r => r.elapsed).join(' / ')})`;
      await saveProxyConfig(url, type);
    } else {
      el.className = 'test-result fail';
      el.textContent = '❌ 部分站点不通';
    }
    let logHtml = '';
    for (const r of results) {
      if (r.success) {
        logHtml += `🟢 <strong>${ts}</strong> — ${r.site} 可访问 (${r.statusCode}, ${r.elapsed})<br>`;
      } else {
        logHtml += `🔴 <strong>${ts}</strong> — ${r.site} 失败：${escapeHtml(r.hint || r.error)}<br>`;
      }
    }
    log.innerHTML = logHtml + log.innerHTML;
  } catch (e) {
    el.className = 'test-result fail';
    el.textContent = '❌ 网络错误: ' + e.message;
    log.innerHTML = `🔴 <strong>${ts}</strong> — 测试失败：${escapeHtml(e.message)}<br>` + log.innerHTML;
  }
}

async function autoDetectProxy() {
  const el = document.getElementById('testResult');
  el.className = 'test-result testing';
  el.textContent = '⏳ 正在检测系统代理...';

  try {
    const data = await window.electronAPI.detectProxy();
    if (data.found && data.proxy) {
      document.getElementById('settingsProxyUrl').value = data.proxy.url;
      document.getElementById('settingsProxyType').value = data.proxy.type || 'http';
      el.className = 'test-result ok';
      el.textContent = `✅ 已检测到代理：${data.proxy.url}`;
      await saveProxyConfig(data.proxy.url, data.proxy.type || 'http');
      refreshSettingsPage();
    } else {
      el.className = 'test-result fail';
      el.textContent = '❌ 未检测到系统代理，请手动输入';
    }
  } catch (e) {
    el.className = 'test-result fail';
    el.textContent = '❌ 检测失败: ' + e.message;
  }
}
