# Nyoura Assistant

**NYouRa — New Ra — the new sun for your voice.**

An open-source voice assistant powered by Google Gemini Live. Runs locally on your desktop, talks to Gemini over WebSocket, plays audio in real time.

![Nyoura Assistant](build/icon.ico)

## Features

- **Real-time voice** — talk naturally, get instant voice replies
- **Powered by Gemini Live** — Google's multimodal streaming API
- **Model selector** — switch between Gemini Live models on the fly
- **Optional SOCKS5 proxy** — works behind corporate networks or restricted Wi-Fi
- **Encrypted API key storage** — your Gemini key is encrypted with Windows DPAPI
- **Auto-updates** — always on the latest version via GitHub Releases
- **One-click installer** — no admin rights required

## Requirements

- Windows 10 or 11 (x64)
- A Google Gemini API key (free tier available)

## Installation

1. Download the latest `Nyoura Assistant Setup x.x.x.exe` from [Releases](https://github.com/yankelperelman/nyoura-assistant/releases).
2. Run the installer. It installs to your user folder — no admin rights needed.
3. On first launch, the setup window will ask for:
   - **Gemini API Key** — get one free at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
   - **SOCKS5 proxy** — optional; only needed if your network requires it
4. Click **Start** and start speaking.

## How it works
