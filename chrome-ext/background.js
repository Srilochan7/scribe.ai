// background.js
let isRecording = false;
let recordingStartTime = null;

// Listen for messages from the popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === 'start') {
        startRecording();
    } else if (request.command === 'stop') {
        stopRecording();
    } else if (request.command === 'get_status') {
        sendResponse({ 
            isRecording: isRecording,
            startTime: recordingStartTime 
        });
    } else if (request.command === 'recording_started_content') {
        handleRecordingStarted(request.startTime);
    } else if (request.command === 'recording_stopped_content') {
        handleRecordingStopped(request.audioData, request.duration);
    } else if (request.command === 'recording_error_content') {
        handleRecordingError(request.message);
    }
    
    return true; 
});

async function startRecording() {
    if (isRecording) {
        console.log("Already recording.");
        return;
    }

    try {
        const [activeTab] = await chrome.tabs.query({ 
            active: true, 
            currentWindow: true 
        });
        
        if (!activeTab) {
            throw new Error('No active tab found');
        }

        // Inject the recording script into the active tab
        await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['recording-injected.js']
        });

        // Send message to start recording
        chrome.tabs.sendMessage(activeTab.id, { command: 'start_recording' });

    } catch (err) {
        console.error("Error starting recording:", err);
        chrome.runtime.sendMessage({ 
            command: 'error', 
            message: err.message || 'Failed to start recording' 
        });
    }
}

async function stopRecording() {
    if (!isRecording) {
        console.log("Not currently recording.");
        return;
    }

    try {
        const [activeTab] = await chrome.tabs.query({ 
            active: true, 
            currentWindow: true 
        });
        
        if (activeTab) {
            chrome.tabs.sendMessage(activeTab.id, { command: 'stop_recording' });
        }
        
    } catch (err) {
        console.error("Error stopping recording:", err);
        isRecording = false;
        recordingStartTime = null;
        chrome.runtime.sendMessage({ command: 'recording_stopped' });
    }
}

function handleRecordingStarted(startTime) {
    isRecording = true;
    recordingStartTime = startTime || Date.now();
    chrome.runtime.sendMessage({ 
        command: 'recording_started',
        startTime: recordingStartTime 
    });
}

function handleRecordingStopped(audioData, duration) {
    isRecording = false;
    recordingStartTime = null;
    
    chrome.runtime.sendMessage({ 
        command: 'recording_stopped',
        duration: Math.floor(duration / 1000) 
    });
    
    if (audioData) {
        processAudioData(audioData);
    }
}

function handleRecordingError(message) {
    isRecording = false;
    recordingStartTime = null;
    chrome.runtime.sendMessage({ 
        command: 'error', 
        message: message 
    });
}

async function processAudioData(base64AudioData) {
    try {
        chrome.runtime.sendMessage({ 
            command: 'upload_started',
            message: 'Uploading audio to server...' 
        });

        const binaryString = atob(base64AudioData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const audioBlob = new Blob([bytes], { type: 'audio/webm' });
        
        await sendToServer(audioBlob);
        
    } catch (error) {
        console.error('Error processing audio:', error);
        chrome.runtime.sendMessage({ 
            command: 'upload_failed',
            message: 'Failed to process audio data' 
        });
    }
}

async function sendToServer(audioBlob) {
    console.log("Sending audio to server...");
    
    try {
        const formData = new FormData();
        formData.append('file', audioBlob, `meeting-${Date.now()}.webm`);
        formData.append('timestamp', new Date().toISOString());
        formData.append('source', 'google-meet');

        // Replace with your actual server URL
        const response = await fetch('https://YOUR_BACKEND_URL/transcribe', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server responded with ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        console.log("Server response:", result);
        
        chrome.runtime.sendMessage({ 
            command: 'upload_completed',
            message: 'Audio uploaded and processed successfully!',
            data: result 
        });

    } catch (err) {
        console.error("Error sending audio to server:", err);
        chrome.runtime.sendMessage({ 
            command: 'upload_failed', 
            message: `Upload failed: ${err.message}` 
        });
    }
}