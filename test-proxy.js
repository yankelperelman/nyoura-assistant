require('dotenv').config();
const WebSocket = require('ws');
// Важно: импортируем именно так, чтобы избежать ошибки конструктора
const { SocksProxyAgent } = require('socks-proxy-agent');

const PROXY_URL = 'socks5://127.0.0.1:1080';
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error("❌ Ошибка: GEMINI_API_KEY не найден в .env");
    process.exit(1);
}

console.log(`🔄 Тестирую подключение к Gemini Live через SOCKS5 (${PROXY_URL})...`);

// Создаем агента
const agent = new SocksProxyAgent(PROXY_URL);

// URL эндпоинта Gemini Live
const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

const ws = new WebSocket(url, { agent });

ws.on('open', () => {
    console.log('✅ SUCCESS! Соединение установлено через прокси.');
    console.log('Теперь можно отправлять setup сообщение.');
    
    // Отправляем минимальную конфигурацию, чтобы сервер ответил
    const setupMsg = {
        setup: {
            model: "models/gemini-3.8-live", // Убедись, что имя модели верное
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } }
                }
            }
        }
    };
    
    ws.send(JSON.stringify(setupMsg));
});

ws.on('message', (data) => {
    try {
        const msg = JSON.parse(data.toString());
        if (msg.setupComplete) {
            console.log('🎉 ПОЛНАЯ УСПЕШНОСТЬ! Сервер принял конфиг и готов слушать аудио.');
            ws.close();
            process.exit(0);
        } else if (msg.error) {
            console.error('⚠️ Ошибка от Google API:', msg.error.message || msg.error.code);
            ws.close();
            process.exit(1);
        } else {
            console.log('ℹ️ Получено другое сообщение:', JSON.stringify(msg).substring(0, 100));
        }
    } catch (e) {
        console.log('📦 Бинарное/непонятное сообщение:', data.length, 'байт');
    }
});

ws.on('error', (err) => {
    console.error('❌ FAILED! Ошибка соединения:', err.message);
    if (err.message.includes('ECONNREFUSED')) {
        console.error('💡 Совет: Проверь, открыт ли SSH туннель (ssh -D 1080 ...)');
    }
    process.exit(1);
});

ws.on('close', () => {
    console.log('🔌 Соединение закрыто.');
});