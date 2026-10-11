// c:\Electron\renderer.js

// ===============================
// Audio state
// ===============================

let audioContext = null;
let playbackContext = null;

let mediaStreamSource = null;
let microphoneStream = null;
let processor = null;
let muteGainNode = null;

let isListening = false;
let isStarting = false;

let chunkCount = 0;
let playbackChunkCount = 0;

// Playback queue to preserve chunk order
let playbackQueue = Promise.resolve();
let nextPlayTime = 0;

// ===============================
// UI
// ===============================

const statusEl = document.getElementById('status');
const logsEl = document.getElementById('logs');
const startBtn = document.getElementById('start-btn');

function log(message) {
    console.log(message);

    if (logsEl) {
        logsEl.textContent +=
            `\n${new Date().toLocaleTimeString()}: ${message}`;

        logsEl.scrollTop = logsEl.scrollHeight;
    }
}

function setStatus(message) {
    if (statusEl) {
        statusEl.textContent = message;
    }
}

// ===============================
// AudioContext initialization
// ===============================

function createMicrophoneAudioContext() {
    const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
        throw new Error('Web Audio API is not available in this browser');
    }

    // Prefer 16 kHz for the microphone.
    // If the browser doesn't support it, fall back to default
    // and resample manually.
    try {
        return new AudioContextClass({
            sampleRate: 16000
        });
    } catch (error) {
        log(`Failed to create 16 kHz AudioContext: ${error.message}`);
        log('Using default AudioContext sample rate.');

        return new AudioContextClass();
    }
}

function createPlaybackAudioContext() {
    const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
        throw new Error('Web Audio API is not available');
    }

    // 24000 Hz — the sample rate Gemini Live outputs audio at.
    // Avoids resampling 24k -> 48k and the clicks at chunk boundaries.
    return new AudioContextClass({
        sampleRate: 24000
    });
}

// ===============================
// Start microphone and connect
// ===============================

async function initAudioAndConnect() {
    if (isListening || isStarting) {
        return;
    }

    isStarting = true;

    if (startBtn) {
        startBtn.disabled = true;
    }

    try {
        if (!window.electronAPI) {
            throw new Error('electronAPI not found. Check preload.js');
        }

        if (
            typeof window.electronAPI.initGemini !== 'function' ||
            typeof window.electronAPI.sendAudioChunk !== 'function' ||
            typeof window.electronAPI.onPlayAudio !== 'function'
        ) {
            throw new Error(
                'preload.js is missing initGemini, ' +
                'sendAudioChunk or onPlayAudio'
            );
        }

        // 1. AudioContext for the microphone

        audioContext = createMicrophoneAudioContext();

        log(`Microphone AudioContext: ${audioContext.sampleRate} Hz`);

        await audioContext.resume();

        // 2. Separate AudioContext for Gemini playback

        if (!playbackContext || playbackContext.state === 'closed') {
            playbackContext = createPlaybackAudioContext();
            nextPlayTime = 0;
        }

        await playbackContext.resume();

        // 3. Get microphone

        microphoneStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: {
                    ideal: 1
                }
            }
        });

        mediaStreamSource =
            audioContext.createMediaStreamSource(microphoneStream);

        // 4. Microphone audio processing.
        // 2048 frames = ~128 ms at 16 kHz.

        processor = audioContext.createScriptProcessor(
            1024,
            1,
            1
        );

        processor.onaudioprocess = (event) => {
            if (!isListening) {
                return;
            }

            try {
                const inputData =
                    event.inputBuffer.getChannelData(0);

                // Show level for the first five chunks.
                if (chunkCount < 5) {
                    let sum = 0;

                    for (let i = 0; i < inputData.length; i++) {
                        sum += Math.abs(inputData[i]);
                    }

                    const avgAmplitude =
                        sum / Math.max(1, inputData.length);

                    log(
                        `[Mic Chunk ${chunkCount}] ` +
                        `Avg amplitude: ${avgAmplitude.toFixed(6)}`
                    );

                    chunkCount++;
                }

                // Float32 -> raw PCM Int16, 16 kHz, little-endian.
                const pcmData = floatToPCM(
                    inputData,
                    audioContext.sampleRate,
                    16000
                );

                if (pcmData.length === 0) {
                    return;
                }

                // Send only PCM bytes, no WAV header.
                const audioPacket = pcmData.buffer.slice(
                    pcmData.byteOffset,
                    pcmData.byteOffset + pcmData.byteLength
                );

                window.electronAPI.sendAudioChunk(audioPacket);

            } catch (error) {
                log(`[Mic ERROR] ${error.message}`);
            }
        };

        // 5. Connect microphone to processor.

        mediaStreamSource.connect(processor);

        // ScriptProcessorNode must be connected to destination,
        // otherwise some implementations don't fire onaudioprocess.
        // Gain = 0 prevents direct microphone playback.

        muteGainNode = audioContext.createGain();
        muteGainNode.gain.value = 0;

        processor.connect(muteGainNode);
        muteGainNode.connect(audioContext.destination);

        // 6. Connect Gemini through the Main Process.

        log('Connecting to Gemini...');
        setStatus('Connecting to Gemini...');

        const result = await window.electronAPI.initGemini();

        if (!result || !result.success) {
            throw new Error(
                result?.error || 'Failed to connect to Gemini'
            );
        }

        isListening = true;

        setStatus('🟢 LIVE: Speaking to Gemini');
        log('Connected! Start speaking.');

        if (startBtn) {
            startBtn.textContent = 'Running...';
            startBtn.disabled = true;
        }

    } catch (error) {
        isListening = false;

        log(`[ERROR] ${error.message}`);
        setStatus('❌ Error');

        await releaseAudioResources();

        if (startBtn) {
            startBtn.disabled = false;
            startBtn.textContent = 'Start';
        }

        alert('Failed to start voice session: ' + error.message);

    } finally {
        isStarting = false;
    }
}

// ===============================
// Float32 -> PCM Int16
// ===============================

/**
 * Converts Float32 microphone samples to raw PCM signed Int16 LE.
 *
 * @param {Float32Array} floatArray
 * @param {number} inputSampleRate
 * @param {number} targetSampleRate
 * @returns {Int16Array}
 */
function floatToPCM(
    floatArray,
    inputSampleRate,
    targetSampleRate = 16000
) {
    if (
        !(floatArray instanceof Float32Array) ||
        !Number.isFinite(inputSampleRate) ||
        !Number.isFinite(targetSampleRate) ||
        inputSampleRate <= 0 ||
        targetSampleRate <= 0
    ) {
        throw new TypeError('Invalid floatToPCM parameters');
    }

    let samples = floatArray;

    // Resample if the actual context rate isn't 16 kHz.
    if (inputSampleRate !== targetSampleRate) {
        const ratio = inputSampleRate / targetSampleRate;
        const outputLength = Math.round(
            floatArray.length / ratio
        );

        const resampled = new Float32Array(outputLength);

        for (let i = 0; i < outputLength; i++) {
            const sourcePosition = i * ratio;
            const index0 = Math.floor(sourcePosition);
            const index1 = Math.min(
                index0 + 1,
                floatArray.length - 1
            );

            const fraction = sourcePosition - index0;

            const sample0 = floatArray[
                Math.min(index0, floatArray.length - 1)
            ];

            const sample1 = floatArray[index1];

            resampled[i] =
                sample0 * (1 - fraction) +
                sample1 * fraction;
        }

        samples = resampled;
    }

    // Float32 [-1, 1] -> signed Int16.
    const pcm = new Int16Array(samples.length);

    for (let i = 0; i < samples.length; i++) {
        const sample = Math.max(
            -1,
            Math.min(1, samples[i])
        );

        pcm[i] = sample < 0
            ? Math.round(sample * 32768)
            : Math.round(sample * 32767);
    }

    return pcm;
}

// ===============================
// IPC audio bytes normalization
// ===============================

/**
 * Normalizes bytes received via Electron IPC.
 */
function pcmBytesFromIPC(data) {
    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }

    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(
            data.buffer,
            data.byteOffset,
            data.byteLength
        );
    }

    if (
        data &&
        data.type === 'Buffer' &&
        Array.isArray(data.data)
    ) {
        return Uint8Array.from(data.data);
    }

    if (Array.isArray(data)) {
        return Uint8Array.from(data);
    }

    throw new TypeError(
        `Unknown audio format from IPC: ${
            data?.constructor?.name || typeof data
        }`
    );
}

// ===============================
// Play Gemini audio
// ===============================

async function playGeminiAudio(data) {
    if (!playbackContext || playbackContext.state === 'closed') {
        playbackContext = createPlaybackAudioContext();
        nextPlayTime = 0;
    }

    if (playbackContext.state === 'suspended') {
        await playbackContext.resume();
    }

    const bytes = pcmBytesFromIPC(data);

    // One PCM Int16 sample = 2 bytes.
    const validByteLength = bytes.byteLength -
        (bytes.byteLength % 2);

    if (validByteLength === 0) {
        return;
    }

    if (validByteLength !== bytes.byteLength) {
        log('[Playback WARNING] Odd number of PCM bytes.');
    }

    const dataView = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        validByteLength
    );

    const sampleCount = validByteLength / 2;
    const floatSamples = new Float32Array(sampleCount);

    // Raw signed PCM Int16, little-endian -> Float32.
    for (let i = 0; i < sampleCount; i++) {
        const int16Sample = dataView.getInt16(i * 2, true);
        floatSamples[i] = int16Sample / 32768;
    }

    // Diagnostics for the first three output chunks.
    if (playbackChunkCount < 3) {
        let peak = 0;

        for (let i = 0; i < floatSamples.length; i++) {
            peak = Math.max(
                peak,
                Math.abs(floatSamples[i])
            );
        }

        log(
            `[Playback Chunk ${playbackChunkCount}] ` +
            `${validByteLength} bytes, ` +
            `${sampleCount} samples, ` +
            `peak: ${peak.toFixed(4)}`
        );

        playbackChunkCount++;
    }

    // Gemini Live output: 24 kHz PCM.
    const audioBuffer = playbackContext.createBuffer(
        1,
        sampleCount,
        24000
    );

    audioBuffer.copyToChannel(floatSamples, 0);

    const source = playbackContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(playbackContext.destination);

    // Pre-buffer 150 ms — smooths out chunk jitter over the tunnel.
    const startAt = Math.max(
        nextPlayTime,
        playbackContext.currentTime + 0.8
    );

    source.start(startAt);

    nextPlayTime = startAt + audioBuffer.duration;

    source.onended = () => {
        source.disconnect();
    };
}

// ===============================
// Listen for audio from Main Process
// ===============================

if (
    window.electronAPI &&
    typeof window.electronAPI.onPlayAudio === 'function'
) {
    window.electronAPI.onPlayAudio((data) => {
        playbackQueue = playbackQueue
            .then(() => playGeminiAudio(data))
            .catch((error) => {
                log(`[Playback ERROR] ${error.message}`);
            });
    });
} else {
    log('[ERROR] electronAPI.onPlayAudio not found in preload.js');
}

// ===============================
// Model selector
// ===============================

async function initModelSelector() {
    if (
        !window.electronAPI ||
        typeof window.electronAPI.getModels !== 'function'
    ) {
        log('[Model] getModels not available in preload.js — selector skipped');
        return;
    }

    let select = document.getElementById('model-select');

    // If index.html has no selector — create one next to the Start button
    if (!select && startBtn && startBtn.parentNode) {
        const wrapper = document.createElement('div');
        wrapper.style.margin = '10px 0';

        const label = document.createElement('label');
        label.textContent = 'Model: ';
        label.style.marginRight = '8px';

        select = document.createElement('select');
        select.id = 'model-select';
        select.style.padding = '6px';
        select.style.minWidth = '280px';

        wrapper.appendChild(label);
        wrapper.appendChild(select);

        startBtn.parentNode.insertBefore(wrapper, startBtn);
    }

    if (!select) {
        log('[Model] Selector not found and could not be created');
        return;
    }

    let data;
    try {
        data = await window.electronAPI.getModels();
    } catch (e) {
        log(`[Model] Failed to fetch models: ${e.message}`);
        return;
    }

    const models = data?.models || [];
    const current = data?.current;

    select.innerHTML = '';

    for (const m of models) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.label;
        if (m.id === current) opt.selected = true;
        select.appendChild(opt);
    }

    select.addEventListener('change', async () => {
        try {
            const res = await window.electronAPI.setModel(select.value);
            if (res && res.success) {
                log(`[Model] Switched to ${res.model}. ` +
                    `Restart the session (Stop → Start) to apply.`);
            } else {
                log(`[Model] Error: ${res?.error || 'unknown'}`);
            }
        } catch (e) {
            log(`[Model] Model switch error: ${e.message}`);
        }
    });

    log(`[Model] Loaded ${models.length} models, current: ${current}`);
}

// ===============================
// Resource cleanup
// ===============================

async function releaseAudioResources() {
    isListening = false;

    if (processor) {
        processor.onaudioprocess = null;
    }

    for (const node of [
        mediaStreamSource,
        processor,
        muteGainNode
    ]) {
        if (node) {
            try {
                node.disconnect();
            } catch (_) {
                // Node already disconnected.
            }
        }
    }

    if (microphoneStream) {
        for (const track of microphoneStream.getTracks()) {
            track.stop();
        }
    }

    mediaStreamSource = null;
    processor = null;
    muteGainNode = null;
    microphoneStream = null;

    if (audioContext && audioContext.state !== 'closed') {
        try {
            await audioContext.close();
        } catch (error) {
            console.warn('AudioContext close:', error.message);
        }
    }

    audioContext = null;

    if (playbackContext && playbackContext.state !== 'closed') {
        try {
            await playbackContext.close();
        } catch (error) {
            console.warn('PlaybackContext close:', error.message);
        }
    }

    playbackContext = null;
    nextPlayTime = 0;
}

// ===============================
// Start button + init
// ===============================

if (startBtn) {
    startBtn.addEventListener('click', initAudioAndConnect);
}

const settingsBtn = document.getElementById('settings-btn');
if (settingsBtn && window.electronAPI?.openSettings) {
    settingsBtn.addEventListener('click', () => {
        window.electronAPI.openSettings();
    });
}

initModelSelector();