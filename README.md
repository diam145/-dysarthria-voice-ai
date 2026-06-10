# Dysarthria Voice AI

A live AI-driven speech transcription web application designed to help people with Dysarthria communicate more clearly. It uses a custom fine-tuned Whisper model to transcribe speech in real time, with a Speaker mode for recording and a Guest mode for viewing.

---

## Overview

Dysarthria Voice AI enables people with motor speech disorders to be understood more easily. A speaker records their voice in the browser; the audio is transcribed using a fine-tuned Whisper model hosted on Hugging Face, and the transcript is shared live with guests via a QR code or link.

---

## Features

- Real-time speech-to-text transcription using a fine-tuned Whisper model
- **Speaker mode** — records and broadcasts audio from the host's device
- **Guest mode** — view-only access via QR code or shareable link
- Live transcript syncing across all connected guests
- QR code session sharing for quick guest onboarding
- Dark and colorful themes
- Smooth animations and mobile-friendly UI
- Firebase-powered real-time signaling

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (96.5%), HTML (3.5%) |
| Framework | Vite + React |
| AI Model | Fine-tuned Whisper (whisper-small-specific-finetuned) |
| Model Hosting | Hugging Face Inference API |
| Real-time sync | Firebase |
| Build tool | Vite |

---

## Project Structure

```
-dysarthria-voice-ai/
├── components/        # React UI components
├── services/          # Transcription, Firebase, and session services
├── App.tsx            # Root application component
├── index.tsx          # Entry point
├── index.html
├── env.d.ts           # Environment variable type definitions
└── LICENSE            # MIT License
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- A [Hugging Face](https://huggingface.co/) account and API token
- A [Firebase](https://firebase.google.com/) project

### Setup

1. Clone the repository:

```bash
git clone https://github.com/diam145/-dysarthria-voice-ai.git
cd -dysarthria-voice-ai
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file at the root with your credentials:

```env
VITE_HF_TOKEN=your_hugging_face_api_token
VITE_ENDPOINT_URL=your_inference_endpoint_url  # optional, defaults to HF hosted model
```

4. Start the development server:

```bash
npm run dev
```

5. Open `http://localhost:5173` in your browser.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_HF_TOKEN` | Yes | Hugging Face API token for model inference |
| `VITE_ENDPOINT_URL` | No | Custom inference endpoint URL (optional) |

---

## AI Model

The app uses a Whisper model fine-tuned for dysarthric speech:
**[pealsen/whisper-small-specific-finetuned](https://huggingface.co/pealsen/whisper-small-specific-finetuned)** on Hugging Face.

---

## License

This project is licensed under the [MIT License](LICENSE).

---

## Author

**[@diam145](https://github.com/diam145)**
