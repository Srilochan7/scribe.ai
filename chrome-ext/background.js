// background.js (service worker)
chrome.runtime.onMessage.addListener(async (request, sender) => {
  if (request.command === 'start') {
    try {
      // ensure there is an active Meet tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url || !tab.url.includes('meet.google.com')) {
        throw new Error('Please open Google Meet first');
      }

      // create offscreen doc if not present
      const offscreenUrl = chrome.runtime.getURL('offscreen.html');
      const exists = await chrome.offscreen.hasDocument?.();
      if (!exists) {
        await chrome.offscreen.createDocument({
          url: offscreenUrl,
          reasons: ['USER_MEDIA'],
          justification: 'Record Google Meet audio for transcription'
        });
      }

      // get media stream id for target tab
      const streamId = await new Promise((resolve) =>
        chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, resolve)
      );

      if (!streamId) throw new Error('Could not get stream id');

      // tell offscreen to start capturing (send streamId + server url)
      await chrome.runtime.sendMessage({ command: 'offscreen_start', streamId, serverUrl: request.serverUrl || 'http://localhost:8000/transcribe' });

      // notify popup UI
      chrome.runtime.sendMessage({ command: 'recording_started' });

    } catch (err) {
      console.error('background start error', err);
      chrome.runtime.sendMessage({ command: 'error', message: err.message });
    }
  } else if (request.command === 'stop') {
    try {
      // tell offscreen to stop and then close offscreen doc
      await chrome.runtime.sendMessage({ command: 'offscreen_stop' });
      // give it a moment to finish, then close
      setTimeout(async () => {
        try { await chrome.offscreen.closeDocument(); } catch(e){ /* ignore */ }
      }, 500);
      chrome.runtime.sendMessage({ command: 'recording_stopped' });
    } catch (err) {
      console.error('background stop error', err);
      chrome.runtime.sendMessage({ command: 'error', message: err.message });
    }
  }
});
