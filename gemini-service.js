// c:\Electron\gemini-service.js
const WebSocket = require('ws');
const { SocksProxyAgent } = require('socks-proxy-agent');
require('dotenv').config();

class GeminiLiveService {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.onAudioChunk = null;
        this.onError = null;
        this.setupComplete = false;
    }

    connect(callbacks) {
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            throw new Error("❌ Error: GEMINI_API_KEY not found");
        }

        this.onAudioChunk = callbacks.onAudioChunk || (() => {});
        this.onError = callbacks.onError || ((err) => console.error(err));
        this.setupComplete = false;

        // === Model comes from main.js (via UI selector) ===
        const MODEL_NAME = callbacks.model || "models/gemini-3.8-live";
        console.log(`🧠 [GeminiService] Model: ${MODEL_NAME}`);

        const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

        // === Proxy (optional) ===
        const PROXY_URL = process.env.SOCKS_PROXY || '';
        let agent = null;

        if (PROXY_URL) {
            try {
                agent = new SocksProxyAgent(PROXY_URL);
                console.log(`🌐 [GeminiService] Using proxy: ${PROXY_URL}`);
            } catch (e) {
                throw new Error(`❌ Failed to create proxy agent: ${e.message}`);
            }
        } else {
            console.log('🌐 [GeminiService] No proxy configured — connecting directly.');
        }

        console.log(`🔄 [GeminiService] Connecting to ${MODEL_NAME}...`);

        // === WebSocket: with or without agent ===
        this.ws = agent
            ? new WebSocket(url, { agent })
            : new WebSocket(url);

        this.ws.on('open', () => {
            console.log('✅ [GeminiService] WebSocket opened.');
            this.isConnected = true;

            const setupConfig = {
                setup: {
                    model: MODEL_NAME,
                    generationConfig: {
                        responseModalities: ["AUDIO"],
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: { voiceName: "Aoede" }
                            }
                        }
                    },
                    systemInstruction: {
                        parts: [{
                            text: "You are Nyoura, a voice assistant. Always respond in the same language the user speaks. If the user speaks Russian — respond only in Russian. If the user speaks English — respond in English. Do not switch to Spanish or any other language unless the user explicitly asks. Keep responses short and to the point."
                        }]
                    },
                    inputAudioTranscription: {},
                    outputAudioTranscription: {}
                }
            };

            this.ws.send(JSON.stringify(setupConfig));
        });

        this.ws.on('message', (data) => {
            try {
                const msgStr = data.toString();
                const msg = JSON.parse(msgStr);

                if (msg.setupComplete) {
                    console.log('🎉 [GeminiService] Setup complete! Session ready.');
                    this.setupComplete = true;
                    return;
                }

                if (msg.serverContent && msg.serverContent.modelTurn) {
                    const turn = msg.serverContent.modelTurn;

                    if (turn.parts && turn.parts.length > 0) {
                        for (const part of turn.parts) {
                            if (part.inlineData && part.inlineData.data) {
                                const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
                                if (this.onAudioChunk) {
                                    this.onAudioChunk(audioBuffer);
                                }
                            }

                            if (part.text) {
                                console.log(`💬 [Model Text]: ${part.text}`);
                            }
                        }
                    }
                }

                if (msg.error) {
                    console.error('❌ [GeminiService] API Error:', msg.error);
                    if (this.onError) {
                        this.onError(new Error(msg.error.message || 'Unknown API Error'));
                    }
                }

            } catch (parseError) {
                console.error('❌ [GeminiService] Message parsing error:', parseError);
                console.error('Raw data:', data.toString().substring(0, 200));
            }
        });

        this.ws.on('error', (err) => {
            console.error('❌ [GeminiService] WebSocket error:', err.message);
            this.isConnected = false;
            if (this.onError) this.onError(err);
        });

        this.ws.on('close', (code, reason) => {
            console.log(`🔌 [GeminiService] Connection closed. Code: ${code}, Reason: ${reason || 'None'}`);
            this.isConnected = false;
            this.setupComplete = false;
        });
    }

    sendAudio(pcmBuffer) {
        if (
            !this.isConnected ||
            !this.setupComplete ||
            !this.ws ||
            this.ws.readyState !== WebSocket.OPEN
        ) {
            return;
        }

        if (!Buffer.isBuffer(pcmBuffer)) {
            throw new TypeError('pcmBuffer must be a Buffer instance');
        }

        const payload = {
            realtimeInput: {
                audio: {
                    data: pcmBuffer.toString('base64'),
                    mimeType: 'audio/pcm;rate=16000'
                }
            }
        };

        this.ws.send(JSON.stringify(payload), (err) => {
            if (err) {
                console.error('[GeminiService] Audio send error:', err.message);
                if (this.onError) {
                    this.onError(err);
                }
            }
        });
    }

    sendAudioEndSignal() {
        if (this.isConnected && this.setupComplete && this.ws && this.ws.readyState === WebSocket.OPEN) {
            const payload = {
                realtimeInput: {
                    audioStreamEnd: true
                }
            };
            this.ws.send(JSON.stringify(payload));
            console.log('📤 [GeminiService] Sent audioStreamEnd signal.');
        }
    }

    disconnect() {
        if (this.ws) {
            console.log('🛑 [GeminiService] Closing connection manually...');
            this.ws.close();
            this.ws = null;
            this.isConnected = false;
            this.setupComplete = false;
        }
    }
}

// Export the SINGLE instance of the service
module.exports = new GeminiLiveService();