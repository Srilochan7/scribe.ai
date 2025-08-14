// recording-injected.js
(function() {
    let scribeRecorder = null;

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.command === 'start_recording') {
            startDisplayMediaRecording();
        } else if (request.command === 'stop_recording') {
            stopDisplayMediaRecording();
        }
    });

    function startDisplayMediaRecording() {
        if (scribeRecorder) {
            console.log("Recording already in progress");
            return;
        }

        // Check if we're in a secure context
        if (!window.isSecureContext) {
            chrome.runtime.sendMessage({
                command: 'recording_error_content',
                message: 'Recording requires a secure (HTTPS) context'
            });
            return;
        }

        // Check if getDisplayMedia is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            chrome.runtime.sendMessage({
                command: 'recording_error_content',
                message: 'Screen recording is not supported in this browser'
            });
            return;
        }

        navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        })
        .then(stream => {
            console.log("Display media stream obtained");
            
            // Check if we got audio tracks
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length === 0) {
                throw new Error('No audio track available. Make sure to select "Share audio" when choosing what to share.');
            }

            const audioStream = new MediaStream(audioTracks);
            
            scribeRecorder = {
                mediaRecorder: null,
                audioChunks: [],
                startTime: Date.now(),
                stream: stream
            };

            let mediaRecorder;
            try {
                mediaRecorder = new MediaRecorder(audioStream, {
                    mimeType: 'audio/webm;codecs=opus'
                });
            } catch (e) {
                console.warn('Opus not supported, trying default codec');
                try {
                    mediaRecorder = new MediaRecorder(audioStream, {
                        mimeType: 'audio/webm'
                    });
                } catch (e2) {
                    console.warn('WebM not supported, using default');
                    mediaRecorder = new MediaRecorder(audioStream);
                }
            }
            
            scribeRecorder.mediaRecorder = mediaRecorder;

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    scribeRecorder.audioChunks.push(event.data);
                    console.log('Audio chunk collected:', event.data.size, 'bytes');
                }
            };

            mediaRecorder.onstop = async () => {
                console.log('Recording stopped, processing audio...');
                
                const duration = Date.now() - scribeRecorder.startTime;
                scribeRecorder.stream.getTracks().forEach(track => track.stop());

                if (scribeRecorder.audioChunks.length > 0) {
                    const audioBlob = new Blob(scribeRecorder.audioChunks, { 
                        type: mediaRecorder.mimeType || 'audio/webm' 
                    });
                    
                    const reader = new FileReader();
                    reader.onload = () => {
                        const base64Data = reader.result.split(',')[1];
                        chrome.runtime.sendMessage({
                            command: 'recording_stopped_content',
                            audioData: base64Data,
                            duration: duration
                        });
                    };
                    reader.onerror = () => {
                        chrome.runtime.sendMessage({
                            command: 'recording_error_content',
                            message: 'Failed to process recorded audio'
                        });
                    };
                    reader.readAsDataURL(audioBlob);
                } else {
                    chrome.runtime.sendMessage({
                        command: 'recording_stopped_content',
                        audioData: null,
                        duration: duration
                    });
                }
                
                scribeRecorder = null;
            };

            mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder error:', event.error);
                chrome.runtime.sendMessage({
                    command: 'recording_error_content',
                    message: 'Recording error occurred: ' + event.error.message
                });
                scribeRecorder = null;
            };

            // Handle stream ending (user stops sharing)
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.addEventListener('ended', () => {
                    console.log('User stopped sharing');
                    if (scribeRecorder && scribeRecorder.mediaRecorder.state === 'recording') {
                        scribeRecorder.mediaRecorder.stop();
                    }
                });
            }

            // Start recording
            mediaRecorder.start(1000); // Collect data every 1 second
            
            chrome.runtime.sendMessage({
                command: 'recording_started_content',
                startTime: scribeRecorder.startTime
            });

        })
        .catch(error => {
            console.error("Error accessing display media:", error);
            
            let errorMessage = 'Screen sharing permission denied';
            if (error.name === 'NotAllowedError') {
                errorMessage = 'Permission denied. Please click "Share" and make sure to check "Share audio" if available.';
            } else if (error.name === 'NotFoundError') {
                errorMessage = 'No audio source found. Make sure to select "Share audio" when prompted.';
            } else if (error.name === 'AbortError') {
                errorMessage = 'Recording was cancelled by user.';
            } else if (error.name === 'NotSupportedError') {
                errorMessage = 'Screen recording is not supported in this browser.';
            } else {
                errorMessage = error.message || 'Failed to start screen recording';
            }
            
            chrome.runtime.sendMessage({
                command: 'recording_error_content',
                message: errorMessage
            });
        });
    }

    function stopDisplayMediaRecording() {
        if (scribeRecorder && scribeRecorder.mediaRecorder) {
            if (scribeRecorder.mediaRecorder.state === 'recording') {
                console.log('Stopping recording...');
                scribeRecorder.mediaRecorder.stop();
            }
        } else {
            console.log('No active recording found');
            chrome.runtime.sendMessage({
                command: 'recording_stopped_content',
                audioData: null,
                duration: 0
            });
        }
    }

    console.log('Recording script injected successfully');
})();