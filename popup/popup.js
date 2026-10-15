document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('open-debug').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ active: true, url: ['https://www.doubao.com/*', 'https://www.dola.com/*'] });
  if (tabs[0]) {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_DEBUG_PANEL' }, () => {
      document.getElementById('status').textContent = '调试面板指令已发送';
    });
  } else {
    document.getElementById('status').textContent = '请先打开 doubao.com 页面';
  }
});
