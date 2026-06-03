import os
import uuid
import json
import time
import asyncio
import shutil
from fastapi import FastAPI, UploadFile, File, Request, Query, BackgroundTasks
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from text_parser import split_into_sentences
from tts_with_timestamps import generate_tts_with_timestamps
from vocab_extractor import extract_vocabulary
from translate_align import process_translation_engine
from audio_exporter import export_current_sentence, export_all_zip, export_merged
import history_manager

app = FastAPI()

# 中间件：强制不缓存
@app.middleware("http")
async def add_no_cache_header(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# 确保必要的目录存在
os.makedirs("static", exist_ok=True)
os.makedirs("runs", exist_ok=True)

# 挂载静态文件目录和资源目录
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/runs", StaticFiles(directory="runs"), name="runs")

@app.get("/")
def root():
    with open("static/index.html", "r", encoding="utf-8") as f:
        html = f.read()
        ts = int(time.time())
        html = html.replace("style.css", f"style.css?v={ts}")
        html = html.replace("app.js", f"app.js?v={ts}")
        return HTMLResponse(content=html)

@app.post("/api/generate")
async def generate(file: UploadFile = File(...)):
    t_total_start = time.time()
    
    content = await file.read()
    text = content.decode("utf-8")

    run_id = str(uuid.uuid4())[:8]
    run_dir = f"runs/{run_id}"
    audio_dir = f"{run_dir}/audio"
    words_dir = f"{run_dir}/words"
    os.makedirs(audio_dir, exist_ok=True)
    os.makedirs(words_dir, exist_ok=True)

    t_start = time.time()
    sentences = split_into_sentences(text)
    print(f"[TIMER] parse text: {time.time() - t_start:.3f}s")
    
    t_start = time.time()
    vocab = extract_vocabulary(text)
    print(f"[TIMER] vocab: {time.time() - t_start:.3f}s")

    sem = asyncio.Semaphore(4)

    async def process_sentence(i, en_text):
        audio_filename = f"{i:04d}.mp3"
        audio_filepath = os.path.join(audio_dir, audio_filename)
        words_filepath = os.path.join(words_dir, f"{i:04d}.json")
        
        async with sem:
            words = await generate_tts_with_timestamps(en_text, audio_filepath)
            with open(words_filepath, 'w') as wf:
                json.dump(words, wf)
            return {
                "index": i,
                "en": en_text,
                "zh": "",
                "zh_segments": [],
                "zh_status": "pending",
                "audio_url": f"/runs/{run_id}/audio/{audio_filename}",
                "words": words
            }

    t_tts = time.time()
    tasks = [process_sentence(i, en_text) for i, en_text in enumerate(sentences)]
    manifest_sentences = await asyncio.gather(*tasks)
    manifest_sentences.sort(key=lambda x: x["index"])
    print(f"[TIMER] concurrent tts ({len(sentences)} items): {time.time() - t_tts:.3f}s")

    manifest = {
        "run_id": run_id,
        "sentences": manifest_sentences,
        "vocab": vocab
    }

    manifest_path = os.path.join(run_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        
    title = "Untitled Practice"
    if file.filename:
        title = os.path.splitext(file.filename)[0]
    elif len(sentences) > 0:
        title = sentences[0][:20]
        
    history_manager.add_or_update_run(
        run_id,
        title=title,
        original_filename=file.filename or "",
        sentence_count=len(sentences),
        translated_count=0,
        audio_count=len(sentences)
    )
    
    print(f"[TIMER] FAST MODE total time: {time.time() - t_total_start:.3f}s")
    return manifest

class GenChineseFastReq(BaseModel):
    run_id: str
    engine: str = "gemini"
    chunk_mode: str = "halves"

@app.post("/api/generate_chinese_fast")
async def generate_chinese_fast(req: GenChineseFastReq, background_tasks: BackgroundTasks):
    t_start = time.time()
    run_id = req.run_id
    manifest_path = f"runs/{run_id}/manifest.json"
    
    background_tasks.add_task(process_translation_engine, manifest_path, run_id, req.engine)
    print(f"[TIMER] triggered background FAST translate (engine={req.engine}): {time.time() - t_start:.3f}s")
    return {"run_id": run_id, "status": "started"}

@app.get("/api/translation_status/{run_id}")
async def get_translation_status(run_id: str):
    path = f"runs/{run_id}/translation_status.json"
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return JSONResponse({"status": "idle", "percent": 0, "message": "No status found"}, status_code=200)

@app.get("/api/manifest/{run_id}")
async def get_manifest(run_id: str):
    manifest_path = f"runs/{run_id}/manifest.json"
    if os.path.exists(manifest_path):
        with open(manifest_path, 'r') as f:
            return json.load(f)
    return JSONResponse({"error": "not found"}, status_code=404)

@app.get("/api/history")
def get_history():
    return history_manager.load_history()

class RenameReq(BaseModel):
    title: str

@app.patch("/api/history/{run_id}/rename")
def rename_history(run_id: str, req: RenameReq):
    success = history_manager.rename_run(run_id, req.title)
    if success:
        return {"ok": True, "run_id": run_id, "title": req.title}
    return JSONResponse({"error": "Not found"}, status_code=404)

@app.delete("/api/history/{run_id}")
def delete_history_api(run_id: str):
    if ".." in run_id or "/" in run_id:
        return JSONResponse({"error": "Invalid run_id"}, status_code=400)
    
    run_dir = f"runs/{run_id}"
    if os.path.exists(run_dir):
        shutil.rmtree(run_dir)
        
    history_manager.delete_run(run_id)
    return {"ok": True}

@app.get("/api/download/current")
def download_current(run_id: str, index: int, format: str = Query("mp3")):
    return export_current_sentence(run_id, index, format)

@app.get("/api/download/all.zip")
def download_all(run_id: str, format: str = Query("mp3")):
    return export_all_zip(run_id, format)

@app.get("/api/download/merged")
def download_merged(run_id: str, format: str = Query("mp3")):
    return export_merged(run_id, format)
