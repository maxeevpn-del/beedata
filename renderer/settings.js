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
    document.getElementById('testResult').textContent = 'Saved';
    setTimeout(() => { document.getElementById('testResult').textContent = ''; }, 2000);
    refreshSettingsPage();
  } catch (e) {
    document.getElementById('testResult').className = 'test-result fail';
    document.getElementById('testResult').textContent = 'Save failed';
  }
}

async function testProxy() {
  const url = document.getElementById('settingsProxyUrl').value.trim();
  const type = document.getElementById('settingsProxyType').value;
  const el = document.getElementById('testResult');
  const log = document.getElementById('connectionLog');

  if (!url) {
    el.className = 'test-result fail';
    el.textContent = 'Please enter proxy URL';
    return;
  }

  el.className = 'test-result testing';
  el.textContent = 'Testing baidu / dailyview / televisionstats ...';
  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

  try {
    const results = await window.electronAPI.testProxy({ proxy: url, proxyType: type });
    const allOk = results.every(r => r.success);
    if (allOk) {
      el.className = 'test-result ok';
      el.textContent = 'All passed (' + results.map(r => r.elapsed).join(' / ') + ')';
      await saveProxyConfig(url, type);
    } else {
      el.className = 'test-result fail';
      el.textContent = 'Some failed';
    }
    let logHtml = '';
    for (const r of results) {
      if (r.success) logHtml += `OK ${ts} - ${r.site} (${r.statusCode}, ${r.elapsed})<br>`;
      else logHtml += `FAIL ${ts} - ${r.site}: ${escapeHtml(r.hint || r.error)}<br>`;
    }
    log.innerHTML = logHtml + log.innerHTML;
  } catch (e) {
    el.className = 'test-result fail';
    el.textContent = 'Error: ' + e.message;
    log.innerHTML = `FAIL ${ts} - ${escapeHtml(e.message)}<br>` + log.innerHTML;
  }
}

async function autoDetectProxy() {
  const el = document.getElementById('testResult');
  el.className = 'test-result testing';
  el.textContent = 'Detecting...';

  try {
    const data = await window.electronAPI.detectProxy();
    if (data.found && data.proxy) {
      document.getElementById('settingsProxyUrl').value = data.proxy.url;
      document.getElementById('settingsProxyType').value = data.proxy.type || 'http';
      el.className = 'test-result ok';
      el.textContent = 'Found: ' + data.proxy.url;
      await saveProxyConfig(data.proxy.url, data.proxy.type || 'http');
      refreshSettingsPage();
    } else {
      el.className = 'test-result fail';
      el.textContent = data.message || 'Not found';
    }
  } catch (e) {
    el.className = 'test-result fail';
    el.textContent = 'Failed: ' + e.message;
  }
}
