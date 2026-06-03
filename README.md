# Oral Practice Web

A comprehensive, local web application designed to help users practice oral English. It features advanced sentence parsing, dynamic vocabulary extraction (with IPA and POS), fast asynchronous Text-to-Speech (TTS) generation, and **word-level highlighting** perfectly synced with audio playback.

## Core Features

- 📄 **Upload & Parse**: Upload `.txt` or `.md` files to instantly generate practice sessions.
- 🗣️ **Standard American TTS**: Fast, concurrent Edge-TTS audio generation with word-level timestamps.
- ✨ **Immersive Following**: Highlight spoken words *one by one* in pink as the audio progresses.
- 🇨🇳 **Bilingual Subtitles**: Sync whole Chinese translation lines below the English sentences automatically.
- 📥 **Audio Download**: Download current sentence, bulk ZIP, or a fully merged MP3/WAV/M4A.
- ⚙️ **Playback Controls**: Variable speeds (0.75x, 1.0x, 1.25x, 1.5x) and a Spotify-like lyric click-to-jump mechanism.
- 📚 **Vocabulary Panel**: Extracts Core Words & Phrases directly from your text, rendering IPA pronunciation and contextual Chinese meanings.
- 🗂️ **History Manager**: Safely saves past generated sessions allowing instantaneous loading upon restart.
- 🎯 **Immersive Mode**: Expand the view and enter a distraction-free, large-font practice environment.

## Installation

This project is built using Python (FastAPI backend) and native HTML/CSS/JS (no heavy frontend frameworks required).

1. Clone or download the repository, then navigate to the project directory:
   ```bash
   cd oral_practice_web_github
   ```

2. Create a virtual environment and activate it:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```

3. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. *(Optional Configuration)* If you have the `gemini` CLI installed somewhere specific or wish to change default TTS voices, copy `.env.example` to `.env` and modify the paths.

## Usage

Start the local server using Uvicorn:

```bash
uvicorn app:app --reload --port 8765
```

Open your web browser and navigate to:
**[http://127.0.0.1:8765](http://127.0.0.1:8765)**

### Generating Practice
1. On the web interface, click "Choose File" and upload `data/sample.txt` or your own `.txt` file.
2. Click **Generate Practice (Fast)**. Within seconds, your English pronunciation audio will be ready to play.
3. Click the Play icon (`▶`) next to any sentence to start practicing!
4. *(Optional)* Click **Generate Chinese** to initiate background translation.

## Translation Engines

The tool supports multiple translation engines via the dropdown menu to match your speed and quality preferences:
- **Gemini Quality (Default)**: Uses local `gemini` CLI to provide extremely high-quality translations. (Requires the Gemini CLI tool configured).
- **Fast Free Translator**: Uses `deep-translator` over the public web for instant fallback translations.
- **Offline Argos**: Fully offline and secure local translation model.
  *To use Argos, you must install the optional dependency manually: `pip install argostranslate`*

## Media Conversion (ffmpeg)
While MP3 downloading is natively supported, merging tracks or converting audio to `WAV` or `M4A` requires `ffmpeg` to be installed on your system.

**macOS installation example:**
```bash
brew install ffmpeg
```

## Privacy & Safety
No databases or external cloud storages are attached. Uploaded texts, generated audio, and your practice history are securely stored in the local `./runs/` directory and will not be pushed to Git (they are ignored by `.gitignore`).