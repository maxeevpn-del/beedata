// ========== 璁剧疆椤甸潰閫昏緫 ==========
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
    document.getElementById('testResult').textContent = '鉁?宸蹭繚瀛?;
    setTimeout(() => { document.getElementById('testResult').textContent = ''; }, 2000);
    refreshSettingsPage();
  } catch (e) {
    document.getElementById('testResult').className = 'test-result fail';
    document.getElementById('testResult').textContent = '鉂?淇濆瓨澶辫触';
  }
}

async function testProxy() {
  const url = document.getElementById('settingsProxyUrl').value.trim();
  const type = document.getElementById('settingsProxyType').value;
  const el = document.getElementById('testResult');
  const log = document.getElementById('connectionLog');

  if (!url) {
    el.className = 'test-result fail';
    el.textContent = '鉂?璇峰厛杈撳叆浠ｇ悊鍦板潃';
    return;
  }

  el.className = 'test-result testing';
  el.textContent = '鈴?姝ｅ湪娴嬭瘯 dailyview.tw / televisionstats.com ...';
  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

  try {
    const results = await window.electronAPI.testProxy({ proxy: url, proxyType: type });
    const allOk = results.every(r => r.success);
    if (allOk) {
      el.className = 'test-result ok';
      el.textContent = `鉁?鍏ㄩ儴閫氳繃 (${results.map(r => r.elapsed).join(' / ')})`;
      await saveProxyConfig(url, type);
    } else {
      el.className = 'test-result fail';
      el.textContent = '鉂?閮ㄥ垎绔欑偣涓嶉€?;
    }
    let logHtml = '';
    for (const r of results) {
      if (r.success) {
        logHtml += `馃煝 <strong>${ts}</strong> 鈥?${r.site} 鍙闂?(${r.statusCode}, ${r.elapsed})<br>`;
      } else {
        logHtml += `馃敶 <strong>${ts}</strong> 鈥?${r.site} 澶辫触锛?{escapeHtml(r.hint || r.error)}<br>`;
      }
    }
    log.innerHTML = logHtml + log.innerHTML;
  } catch (e) {
    el.className = 'test-result fail';
    el.textContent = '鉂?缃戠粶閿欒: ' + e.message;
    log.innerHTML = `馃敶 <strong>${ts}</strong> 鈥?娴嬭瘯澶辫触锛?{escapeHtml(e.message)}<br>` + log.innerHTML;
  }
}

async function autoDetectProxy() {
  const el = document.getElementById('testResult');
  el.className = 'test-result testing';
  el.textContent = '鈴?姝ｅ湪妫€娴嬬郴缁熶唬鐞?..';

  try {
    const data = await window.electronAPI.detectProxy();
    if (data.found && data.proxy) {
      document.getElementById('settingsProxyUrl').value = data.proxy.url;
      document.getElementById('settingsProxyType').value = data.proxy.type || 'http';
      el.className = 'test-result ok';
      el.textContent = `鉁?宸叉娴嬪埌浠ｇ悊锛?{data.proxy.url}`;
      await saveProxyConfig(data.proxy.url, data.proxy.type || 'http');
      refreshSettingsPage();
    } else {
      el.className = 'test-result fail';
      el.textContent = '鉂?鏈娴嬪埌绯荤粺浠ｇ悊锛岃鎵嬪姩杈撳叆';
    }
  } catch (e) {
    el.className = 'test-result fail';
    el.textContent = '鉂?妫€娴嬪け璐? ' + e.message;
  }
}
