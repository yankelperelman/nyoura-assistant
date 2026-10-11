const WebSocket = require('ws');
const SocksProxyAgent = require('socks-proxy-agent');
require('dotenv').config(); // Для чтения .env файла

// Конфигурация
const PROXY_URL = 'socks5://127.0.0.1:1080'; // Порт нашего SSH туннеля
const GEMINI_WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=' + process.env.GEMINI_API_KEY;

class GeminiLiveProxy {
  constructor() {
    this.ws = null;
    this.isConnected = false;
  }

  connect(onMessageCallback, onErrorCallback) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY не установлен в .env файле!");
    }

    console.log('Подключаюсь к Gemini через SOCKS5 прокси...');

    // Создаем агента прокси
    const agent = new SocksProxyAgent(PROXY_URL);

    // Инициализируем WebSocket с агентом
    this.ws = new WebSocket(GEMINI_WS_URL, {
      agent: agent,
      headers: {
        'x-goog-api-key': process.env.GEMINI_API_KEY
      }
    });

    this.ws.on('open', () => {
      console.log('✅ Соединение установлено!');
      this.isConnected = true;
      
      // Отправляем конфигурацию сессии (пример для Live API)
      // Важно: структура зависит от конкретной версии API, сверься с доками
      const setupConfig = {
        setup: {
          model: "models/gemini-3.8-live", // Или какая у тебя модель
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } }
            }
          },
          inputAudioTranscription: {}
        }
      };
      
      this.send(JSON.stringify(setupConfig));
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        
        // Обработка разных типов сообщений
        if (msg.serverContent && msg.serverContent.modelTurn) {
           // Здесь приходит текст или метаданные
           onMessageCallback(msg);
        } else if (msg.serverContent && msg.serverContent.inlineData) {
           // Здесь приходят аудио-чанки (base64 PCM)
           onMessageCallback({ type: 'audio_chunk', data: msg.serverContent.inlineData.data });
        }
      } catch (e) {
        console.error('Ошибка парсинга сообщения:', e);
      }
    });

    this.ws.on('error', (err) => {
      console.error('❌ Ошибка WebSocket:', err.message);
      this.isConnected = false;
      onErrorCallback(err);
    });

    this.ws.on('close', () => {
      console.log('🔌 Соединение закрыто.');
      this.isConnected = false;
    });
  }

  sendAudio(pcmBuffer) {
    if (!this.isConnected || !this.ws) return;
    
    // Формат для BidiGenerateContent обычно требует base64 внутри JSON
    // Пример структуры запроса:
    /*
    {
      "realtime_input": {
        "media_chunks": [
          {
            "inline_data": {
              "mime_type": "audio/pcm;rate=16000",
              "data": "<BASE64_PCM_DATA>"
            }
          }
        ]
      }
    }
    */
   
   const payload = {
     realtime_input: {
       media_chunks: [{
         inline_data: {
           mime_type: "audio/pcm;rate=16000", // Проверь частоту дискретизации!
           data: pcmBuffer.toString('base64')
         }
       }]
     }
   };
   
   this.ws.send(JSON.stringify(payload));
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

module.exports = new GeminiLiveProxy();