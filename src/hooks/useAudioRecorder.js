import { useState, useRef, useCallback } from 'react';

export const useAudioRecorder = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    const startRecording = useCallback(async () => {
        try {
            if (mediaRecorderRef.current && isPaused) {
                mediaRecorderRef.current.resume();
                setIsPaused(false);
                setIsRecording(true);
                return;
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/ogg;codecs=opus';

            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
            setIsPaused(false);
            console.log("Audio recording started");
        } catch (error) {
            console.error('Error starting audio recording:', error);
            throw error;
        }
    }, [isPaused]);

    const pauseRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.pause();
            setIsPaused(true);
            setIsRecording(false);
            console.log("Audio recording paused");
        }
    }, []);

    const stopRecording = useCallback(() => {
        return new Promise((resolve) => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.onstop = () => {
                    const mimeType = mediaRecorderRef.current.mimeType;
                    const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
                    const audioUrl = URL.createObjectURL(audioBlob);

                    mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());

                    setIsRecording(false);
                    setIsPaused(false);
                    console.log("Audio recording stopped", { size: audioBlob.size, type: mimeType });
                    resolve({ blob: audioBlob, url: audioUrl, mimeType });
                };
                mediaRecorderRef.current.stop();
            } else {
                resolve(null);
            }
        });
    }, []);

    const saveRecording = useCallback((blob, fileName = 'session-audio') => {
        if (!blob) return;

        const extension = blob.type.includes('webm') ? 'webm' : 'ogg';
        const fullFileName = `${fileName}-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = fullFileName;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 100);
    }, []);

    return {
        isRecording,
        isPaused,
        startRecording,
        pauseRecording,
        stopRecording,
        saveRecording
    };
};
