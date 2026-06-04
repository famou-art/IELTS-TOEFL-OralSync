# IELTS / TOEFL OralSync

A local web application for oral English practice. Upload a `.txt` / `.md` script, get **word-level synchronized TTS playback**, automatic Chinese translation, shadowing evaluation, Anki export, and a real-time pitch contour visualizer — all running locally with no subscription required.

---

## Features

| Feature | Description |
|---------|-------------|
| ⚡ Fast TTS Generation | Concurrent `edge-tts` generation with word-level timestamps |
| 🔤 Word Highlighting | Real-time highlight of the current word during playback |
| 🈶 Chinese Translation | Gemini CLI / Fast Free / Offline Argos — three engine options |
| 🎙 Shadowing Mode | Click the mic button next to any sentence → 3-second countdown → speak → word-by-word diff score |
| 🎧 Podcast Export | EN + dynamic pause (or EN + pause + ZH TTS) merged audio for commute listening |
| 📦 Anki Export | One-click `.apkg` download: sentence cards (ZH→EN + audio) + vocabulary cards |
| 📈 Pitch Visualizer | Real-time pitch contour canvas — orange for native audio, blue for your voice |
| 📚 Vocabulary Panel | Auto-extracted core words (IPA + POS + ZH) and phrases |
| 🕶 Immersive Mode | Full-screen reading mode, hides toolbar clutter |
| 🗂 History | All generated runs are saved locally; rename or delete anytime |

---

## Project Structure

```
.
├── app.py                  # FastAPI backend — routes + orchestration
├── text_parser.py          # Sentence splitting via pysbd (handles Mr. Dr. Jan. etc.)
├── tts_with_timestamps.py  # edge-tts TTS + word timestamp extraction
├── translate_align.py      # Translation pipeline (Gemini / fast / argos) + caching
├── translate_fast.py       # Free online translator fallback
├── translate_argos.py      # Offline Argos translator
├── vocab_extractor.py      # Core word/phrase extraction + IPA + Gemini translation
├── audio_exporter.py       # MP3/WAV/M4A export, ZIP, merged, podcast
├── anki_exporter.py        # Anki .apkg generation (genanki)
├── history_manager.py      # JSON-based run history index
├── requirements.txt
└── static/
    ├── index.html
    ├── style.css
    └── app.js              # All frontend logic (playback, shadowing, pitch canvas)
```

`runs/` is created at runtime — one subdirectory per upload containing `manifest.json` and audio files.

---

## How to Run

```bash
# 1. Clone and enter the project
cd oral_practice_web

# 2. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Start the server
uvicorn app:app --host 0.0.0.0 --port 8765 --reload
```

Open **http://localhost:8765** in Chrome or Safari.

> **Note**: Shadowing Mode uses the browser's built-in `SpeechRecognition` API, which requires an internet connection and Chrome / Safari.

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `fastapi` + `uvicorn` | Web server |
| `edge-tts` | TTS + word timestamps |
| `pysbd` | Accurate sentence boundary detection |
| `genanki` | Anki `.apkg` generation |
| `audioop-lts` | Python 3.13 compatibility shim for audio ops |
| `eng-to-ipa` | IPA pronunciation for vocabulary |
| `deep-translator` | Fast free translation fallback |
| `argostranslate` | Offline translation engine |

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/generate` | POST | Upload `.txt`/`.md`, returns manifest with TTS |
| `/api/generate_chinese_fast` | POST | Trigger background Chinese translation |
| `/api/translation_status/{run_id}` | GET | Poll translation progress |
| `/api/manifest/{run_id}` | GET | Fetch full manifest JSON |
| `/api/history` | GET | List all saved runs |
| `/api/history/{run_id}/rename` | PATCH | Rename a run |
| `/api/history/{run_id}` | DELETE | Delete a run and its files |
| `/api/download/current` | GET | Download current sentence audio |
| `/api/download/all.zip` | GET | Download all sentences as ZIP |
| `/api/download/merged` | GET | Download all sentences merged into one file |
| `/api/download/podcast` | GET | Download podcast-style audio (`mode=en_pause\|en_pause_zh`, `multiplier=1.2`) |
| `/api/download/anki` | GET | Download Anki `.apkg` deck |
