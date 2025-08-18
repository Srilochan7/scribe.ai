// offscreen.js
let mediaRecorder = null;
let audioChunks = [];
let currentStream = null;
let serverUrl = 'http://localhost:8000/transcribe';

async function startCapture(streamId, srvUrl) {
  try {
    serverUrl = srvUrl || serverUrl;

    // Convert the streamId to a MediaStream using getUserMedia with mandatory chromeMediaSourceId
    const constraints = {
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (!stream) throw new Error('Could not getMediaStream from streamId');

    currentStream = stream;
    audioChunks = [];

    // create MediaRecorder (use audio/webm if supported)
    const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/wav';
    mediaRecorder = new MediaRecorder(stream, { mimeType: mime });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      try {
        const blob = new Blob(audioChunks, { type: mime });
        await uploadToServer(blob);
      } catch (err) {
        console.error('offscreen onstop upload error', err);
        chrome.runtime.sendMessage({ command: 'upload_error', message: err.message });
      } finally {
        // stop tracks
        if (currentStream) currentStream.getTracks().forEach(t => t.stop());
        currentStream = null;
      }
    };

    mediaRecorder.start(1000); // chunk every second
    chrome.runtime.sendMessage({ command: 'recording_started' });
  } catch (err) {
    console.error('offscreen startCapture error', err);
    chrome.runtime.sendMessage({ command: 'error', message: err.message });
  }
}

function stopCapture() {
  try {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      chrome.runtime.sendMessage({ command: 'recording_stopped' });
    }
  } catch (err) {
    console.error('offscreen stopCapture error', err);
    chrome.runtime.sendMessage({ command: 'error', message: err.message });
  }
}

async function uploadToServer(audioBlob) {
  try {
    chrome.runtime.sendMessage({ command: 'uploading' });

    const fd = new FormData();
    fd.append('audio', audioBlob, 'meeting.webm');

    const r = await fetch(serverUrl, { method: 'POST', body: fd });
    if (!r.ok) throw new Error(`Server returned ${r.status}`);
    const json = await r.json();
    chrome.runtime.sendMessage({ command: 'upload_success', data: json });
  } catch (err) {
    console.error('uploadToServer error', err);
    chrome.runtime.sendMessage({ command: 'upload_error', message: err.message });
  }
}

// listen for messages from service worker
chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.command === 'offscreen_start') {
    startCapture(request.streamId, request.serverUrl);
  } else if (request.command === 'offscreen_stop') {
    stopCapture();
  }
});
