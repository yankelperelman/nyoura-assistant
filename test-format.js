// c:\Electron\test-format.js
const WebSocket = require('ws');
const { SocksProxyAgent } = require('socks-proxy-agent');
require('dotenv').config();

const PROXY_URL = 'socks5://127.0.0.1:1080';
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = "models/gemini-3.8-live"; // Проверь это имя!

if (!API_KEY) {
    console.error("❌ Нет GEMINI_API_KEY в .env");
    process.exit(1);
}

console.log(`🔄 Тестирование форматов аудио для ${MODEL_NAME}...`);
console.log(`Прокси: ${PROXY_URL}`);

// Генерируем маленький кусок тишины (PCM Int16, 16kHz, моно, 100 мс = 1600 сэмплов)
// Это чтобы просто проверить, примет ли сервер данные
function generateSilenceChunk() {
    const samples = 1600; 
    const buffer = Buffer.alloc(samples * 2); // Int16 = 2 байта на сэмпл
    return buffer.toString('base64');
}

const silenceBase64 = generateSilenceChunk();

// Функция для теста одного формата
async function testFormat(formatName, payloadBuilder) {
    return new Promise((resolve) => {
        console.log(`\n--- ТЕСТ: ${formatName} ---`);
        
        const agent = new SocksProxyAgent(PROXY_URL);
        const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;
        
        const ws = new WebSocket(url, { agent });
        let success = false;
        let errorMsg = "";

        ws.on('open', () => {
            // 1. Отправляем Setup
            const setupMsg = {
                setup: {
                    model: MODEL_NAME,
                    generationConfig: {
                        responseModalities: ["AUDIO"],
                        speechConfig: {
                            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } }
                        }
                    },
                    inputAudioTranscription: {},
                    outputAudioTranscription: {}
                }
            };
            ws.send(JSON.stringify(setupMsg));
        });

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                
                if (msg.setupComplete) {
                    console.log("✅ Setup Complete. Отправляю аудио...");
                    
                    // 2. Строим и отправляем аудио согласно текущему формату
                    const audioPayload = payloadBuilder(silenceBase64);
                    console.log("Отправленный JSON:", JSON.stringify(audioPayload).substring(0, 150) + "...");
                    
                    ws.send(JSON.stringify(audioPayload));
                } else if (msg.error) {
                    errorMsg = msg.error.message || JSON.stringify(msg.error);
                    console.error(`❌ Ошибка API: ${errorMsg}`);
                    ws.close();
                    resolve({ format: formatName, success: false, error: errorMsg });
                } else if (msg.serverContent) {
                    // Если получили ответ или подтверждение приема данных
                    console.log("🎉 УСПЕХ! Сервер принял аудио без ошибок формата.");
                    success = true;
                    ws.close();
                    resolve({ format: formatName, success: true, error: null });
                }
            } catch (e) {
                console.error("Ошибка парсинга ответа:", e);
                ws.close();
                resolve({ format: formatName, success: false, error: "Parse Error" });
            }
        });

        ws.on('error', (err) => {
            console.error(`❌ WS Error: ${err.message}`);
            ws.close();
            resolve({ format: formatName, success: false, error: err.message });
        });

        ws.on('close', () => {
            if (!success && !errorMsg) {
                console.log("🔌 Соединение закрыто без явной ошибки (возможно, таймаут или молчаливый отказ).");
                resolve({ format: formatName, success: false, error: "Connection Closed Unexpectedly" });
            }
        });
    });
}

// === ОПРЕДЕЛЕНИЕ ФОРМАТОВ ===

// Вариант 1: Классический inline_data (snake_case внутри camelCase обертки)
// Часто встречается в старых примерах, но может быть неверным для Live API
const FORMAT_1 = (b64) => ({
    realtimeInput: {
        mediaChunks: [{
            inlineData: {
                mimeType: "audio/pcm;rate=16000",
                data: b64
            }
        }]
    }
});

// Вариант 2: Поле audio напрямую (как в некоторых новых SDK)
const FORMAT_2 = (b64) => ({
    realtimeInput: {
        mediaChunks: [{
            audio: {
                mimeType: "audio/pcm;rate=16000",
                data: b64
            }
        }]
    }
});

// Вариант 3: Полностью snake_case (если API игнорирует camelCase конвертер)
const FORMAT_3 = (b64) => ({
    realtime_input: {
        media_chunks: [{
            inline_data: {
                mime_type: "audio/pcm;rate=16000",
                data: b64
            }
        }]
    }
});

// Вариант 4: Просто data и mime_type на верхнем уровне чанка (без вложенности)
const FORMAT_4 = (b64) => ({
    realtimeInput: {
        mediaChunks: [{
            mimeType: "audio/pcm;rate=16000",
            data: b64
        }]
    }
});

// ЗАПУСК ТЕСТОВ ПО ОЧЕРЕДИ
(async () => {
    const formats = [
        { name: "FORMAT_1 (inlineData)", builder: FORMAT_1 },
        { name: "FORMAT_2 (audio object)", builder: FORMAT_2 },
        { name: "FORMAT_3 (snake_case)", builder: FORMAT_3 },
        { name: "FORMAT_4 (flat fields)", builder: FORMAT_4 }
    ];

    for (const f of formats) {
        const result = await testFormat(f.name, f.builder);
        if (result.success) {
            console.log("\n========================================");
            console.log(`🏆 РАБОЧИЙ ФОРМАТ НАЙДЕН: ${result.format}`);
            console.log("Используй эту структуру в gemini-service.js");
            console.log("========================================");
            break; // Останавливаемся на первом успешном
        }
        // Небольшая пауза между тестами, чтобы не спамить
        await new Promise(r => setTimeout(r, 1000));
    }
    
    console.log("\nТесты завершены.");
})();