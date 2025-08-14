// popup.js
document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const statusDiv = document.getElementById('status');
    const recordingTimer = document.getElementById('recordingTimer');
    const timerText = document.getElementById('timerText');
    
    let recordingStartTime = null;
    let timerInterval = null;

    startBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ command: 'start' });
    });

    stopBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ command: 'stop' });
    });

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (!request.command) return;

        switch (request.command) {
            case 'recording_started':
                const startTime = request.startTime || Date.now();
                startRecordingTimer(startTime);
                updateStatus("🔴 Recording started", "recording");
                startBtn.style.display = 'none';
                stopBtn.style.display = 'block';
                showRecordingTimer();
                break;
                
            case 'recording_stopped':
                stopRecordingTimer();
                const duration = request.duration || 0;
                updateStatus(`⏹️ Recorded ${duration}s - Processing...`, "processing");
                startBtn.style.display = 'block';
                stopBtn.style.display = 'none';
                hideRecordingTimer();
                break;
                
            case 'upload_started':
                updateStatus("📤 Uploading to server...", "uploading");
                break;
                
            case 'upload_completed':
                updateStatus("✅ Upload successful!", "success");
                setTimeout(() => {
                    updateStatus("Ready to record", "ready");
                }, 3000);
                break;
                
            case 'upload_failed':
                updateStatus(`❌ ${request.message}`, "error");
                setTimeout(() => {
                    updateStatus("Ready to record", "ready");
                }, 5000);
                break;
                
            case 'error':
                stopRecordingTimer();
                updateStatus(`❌ ${request.message}`, "error");
                startBtn.style.display = 'block';
                stopBtn.style.display = 'none';
                hideRecordingTimer();
                setTimeout(() => {
                    updateStatus("Ready to record", "ready");
                }, 5000);
                break;
        }
    });

    function startRecordingTimer(startTime = null) {
        recordingStartTime = startTime || Date.now();
        updateTimerDisplay();
        
        timerInterval = setInterval(() => {
            updateTimerDisplay();
        }, 1000);
    }

    function stopRecordingTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        recordingStartTime = null;
    }

    function updateTimerDisplay() {
        if (!recordingStartTime) return;
        
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        
        const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        timerText.textContent = formattedTime;
    }

    function showRecordingTimer() {
        recordingTimer.style.display = 'block';
    }

    function hideRecordingTimer() {
        recordingTimer.style.display = 'none';
        timerText.textContent = '00:00';
    }

    function updateStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = '';
        
        switch (type) {
            case 'recording':
                statusDiv.classList.add('status-recording');
                break;
            case 'processing':
                statusDiv.classList.add('status-processing');
                break;
            case 'uploading':
                statusDiv.classList.add('status-uploading');
                break;
            case 'success':
                statusDiv.classList.add('status-success');
                break;
            case 'error':
                statusDiv.classList.add('status-error');
                break;
            default:
                statusDiv.classList.add('status-ready');
        }
    }

    // Check recording status when popup opens
    chrome.runtime.sendMessage({ command: 'get_status' });
});