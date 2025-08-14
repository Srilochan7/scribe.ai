let mediaRecorder = null;
let audioChunks = [];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.command === 'start') {
    startRecording();
  } else if (request.command === 'stop') {
    stopRecording();
  }
});

async function startRecording() {
  try {
    // Get active tab first
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('meet.google.com')) {
      throw new Error('Please open Google Meet first');
    }

    // Request tab capture with explicit tab ID
    const stream = await chrome.tabCapture.capture({
      audio: true,
      video: false
    });

    if (!stream) {
      throw new Error('Could not capture audio. Try refreshing the page.');
    }

    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      await sendToServer(audioBlob);
      stream.getTracks().forEach(track => track.stop());
    };

    mediaRecorder.start(1000); // Collect data every second
    chrome.runtime.sendMessage({ command: 'recording_started' });

  } catch (error) {
    console.error('Recording error:', error);
    chrome.runtime.sendMessage({ command: 'error', message: error.message });
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    chrome.runtime.sendMessage({ command: 'recording_stopped' });
  }
}

async function sendToServer(audioBlob) {
  try {
    chrome.runtime.sendMessage({ command: 'uploading' });
    
    const formData = new FormData();
    formData.append('audio', audioBlob, 'meeting.webm');

    const response = await fetch('http://localhost:8000/transcribe', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const result = await response.json();
    chrome.runtime.sendMessage({ 
      command: 'upload_success', 
      data: result 
    });

  } catch (error) {
    console.error('Upload error:', error);
    chrome.runtime.sendMessage({ 
      command: 'upload_error', 
      message: error.message 
    });
  }
}