# Nyoura Assistant

**NYouRa — New Ra — the new sun for your voice.**

An open-source desktop voice assistant for [Google Gemini Live](https://ai.google.dev/). Talk naturally and receive real-time voice responses from a lightweight Windows app.

Your microphone, audio playback, and API key are handled locally by the app. AI processing takes place on Google's servers through the Gemini Live API.

![Nyoura Assistant](build/icon.png)

## Features

- **Real-time voice conversations** — speak naturally and get voice replies with low latency.
- **Local-first desktop client** — microphone capture, audio playback, and API key storage are handled on your machine.
- **Google Gemini Live integration** — bring your own Gemini API key.
- **Model selector** — switch between supported Gemini Live models.
- **Optional SOCKS5 proxy** — connect through a proxy when your network requires one.
- **Encrypted API key storage** — the key is encrypted using Windows DPAPI.
- **Automatic updates** — receive new versions through GitHub Releases.
- **Simple installation** — a one-click installer that does not require administrator rights.

## Requirements

- Windows 10 or Windows 11 (x64)
- A Google Gemini API key ([get one from Google AI Studio](https://aistudio.google.com/app/apikey))

## Installation

1. Open the [latest GitHub Releases](https://github.com/yankelperelman/nyoura-assistant/releases).
2. Download the installer named `Nyoura Assistant Setup x.x.x.exe`.
3. Run the installer. The app installs in your user folder and does not require administrator rights.
4. Launch Nyoura Assistant. On first launch, enter:
   - **Gemini API key** — create one in [Google AI Studio](https://aistudio.google.com/app/apikey).
   - **SOCKS5 proxy (optional)** — configure this only if your network requires a proxy.
5. Click **Start** and begin speaking.

> **Note:** Keep your API key private. Usage of the Gemini API may be subject to Google's pricing, quotas, and terms.

## How It Works

Nyoura captures microphone audio, streams it to Gemini Live, and plays the returned audio.

```text
Microphone
    │
    ▼
PCM audio (16 kHz)
    │
    ▼
WebSocket connection
    │
    ▼
Google Gemini Live API
    │
    ▼
WebSocket audio response
    │
    ▼
PCM audio (24 kHz)
    │
    ▼
Speaker
```

The desktop client runs locally. Audio sent for AI processing is transmitted to Google's servers through the Gemini Live API.

The API key is stored locally using Windows DPAPI encryption and is used to authenticate requests to Google.

## Proxy Support

If Gemini Live is unreachable from your network, you can configure a SOCKS5 proxy in **Settings**.

Example:

```text
socks5://127.0.0.1:1080
```

Typical use cases include:

- Corporate networks that require a proxy
- Public Wi-Fi with network restrictions
- A personal tunnel, such as SSH dynamic port forwarding (`ssh -D 1080`), V2Ray, or Shadowsocks

Proxy availability and configuration depend on your network setup. You are responsible for complying with Google's Gemini API terms and applicable local laws.

## Supported Models

Choose a model from the in-app dropdown. The selected model is saved and applied to the next session.

| Model | Notes |
| --- | --- |
| `gemini-3.8-live` | Available if supported by your API access |
| `gemini-3.1-flash-live-preview` | Preview model |
| `gemini-2.5-flash-native-audio-preview-12-2025` | Native audio preview model |

> Model availability and names may change. Check the current [Gemini API documentation](https://ai.google.dev/) for the latest information and access requirements.

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) and npm
- Git
- Windows x64 for building the Windows distribution

### Steps

```bash
git clone https://github.com/yankelperelman/nyoura-assistant.git
cd nyoura-assistant
npm install
npm start
```

To build the Windows installer:

```bash
npm run dist:win
```

Follow the build output for the generated installer location.

## Automatic Updates

Releases are built using GitHub Actions. When a new version is published, the app can download the update in the background and prompt you to restart to apply it.

See [GitHub Releases](https://github.com/yankelperelman/nyoura-assistant/releases) for published versions.

## Privacy and Security

- **Local app:** microphone capture and audio playback are handled by the desktop client.
- **AI processing:** audio sent to Gemini Live is processed by Google's services.
- **API key:** the key is stored locally using Windows DPAPI encryption and is used to authenticate with Google.
- **Network traffic:** a Gemini Live session requires sending audio and session data to Google's API.

Do not use the app to transmit sensitive information unless you understand and accept the applicable service terms and data-handling practices. Review Google's [Gemini API documentation](https://ai.google.dev/) and applicable terms before use.

## License

Nyoura Assistant is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Credits

Built with:

- [Electron](https://www.electronjs.org/)
- [ws](https://github.com/websockets/ws)
- [Google Gemini Live API](https://ai.google.dev/)

---

**NYouRa — the new sun for your voice.**
