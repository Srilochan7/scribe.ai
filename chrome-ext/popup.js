const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const status = document.getElementById('status');

startBtn.onclick = () => {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs[0].url.includes('meet.google.com')) {
      status.textContent = '❌ Please open Google Meet first';
      return;
    }
    chrome.runtime.sendMessage({ command: 'start' });
  });
};

stopBtn.onclick = () => chrome.runtime.sendMessage({ command: 'stop' });

chrome.runtime.onMessage.addListener((request) => {
  switch (request.command) {
    case 'recording_started':
      startBtn.style.display = 'none';
      stopBtn.style.display = 'block';
      status.textContent = '🔴 Recording...';
      break;
    case 'recording_stopped':
      startBtn.style.display = 'block';
      stopBtn.style.display = 'none';
      status.textContent = '📤 Processing...';
      break;
    case 'uploading':
      status.textContent = '📤 Uploading to server...';
      break;
    case 'upload_success':
      status.textContent = '✅ Success! Check server for results';
      setTimeout(() => {
        status.textContent = 'Ready to record';
      }, 3000);
      break;
    case 'upload_error':
      status.textContent = '❌ Upload failed: ' + request.message;
      setTimeout(() => {
        status.textContent = 'Ready to record';
      }, 5000);
      break;
    case 'error':
      startBtn.style.display = 'block';
      stopBtn.style.display = 'none';
      status.textContent = '❌ ' + request.message;
      setTimeout(() => {
        status.textContent = 'Ready to record';
      }, 5000);
      break;
  }
});