# Oral Practice Web

A local web application for oral English practice, featuring sentence parsing, dynamic vocabulary extraction, text-to-speech generation, and **word-level highlighting** synced with playback.

## Project Structure
- `app.py`: FastAPI backend entry point. Handles file uploads and orchestrates generation.
- `tts_with_timestamps.py`: Connects to `edge-tts` to generate MP3 files and word-level timestamps (`offset` and `duration` -> `start` and `end` seconds).
- `text_parser.py`: Simple regex-based sentence chunking.
- `vocab_extractor.py`: Extracts core vocabulary and phrases automatically from uploaded text.
- `static/`: Contains vanilla HTML, CSS, and JS.
- `runs/`: Dynamic directory where the generated audio files and `manifest.json` are stored for each upload.

## How to Run

1. Change directory to the project folder:
   ```bash
   cd REDACTED
   ```

2. Create a virtual environment and activate it:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Start the server:
   ```bash
   uvicorn app:app --reload --port 8765
   ```

5. Open your browser and navigate to:
   [http://127.0.0.1:8765](http://127.0.0.1:8765)
