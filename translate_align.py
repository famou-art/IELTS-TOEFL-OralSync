import subprocess
import json
import re
import hashlib
import os
import time

from translate_fast import translate_fast_sentences
from translate_argos import translate_argos_sentences, check_argos_installed
import history_manager

GEMINI_PATH = os.getenv("GEMINI_CLI_COMMAND", "gemini")
GLOBAL_CACHE_DIR = "runs/global_cache"
ZH_CACHE_FILE = os.path.join(GLOBAL_CACHE_DIR, "zh_sentence_cache.json")

os.makedirs(GLOBAL_CACHE_DIR, exist_ok=True)

def get_hash(engine, en_text):
    return hashlib.sha256(f"{engine}|{en_text}".encode('utf-8')).hexdigest()

def load_cache():
    if os.path.exists(ZH_CACHE_FILE):
        try:
            with open(ZH_CACHE_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_cache(cache):
    temp_file = ZH_CACHE_FILE + ".tmp"
    with open(temp_file, 'w') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
    os.replace(temp_file, ZH_CACHE_FILE)

def update_status(run_id, status_data):
    path = f"runs/{run_id}/translation_status.json"
    with open(path, "w", encoding='utf-8') as f:
        json.dump(status_data, f, ensure_ascii=False)

def fast_translate_sentences_gemini(batch):
    if not batch: return []
    
    prompt = "You are a professional English-Chinese translator.\n\n"
    prompt += "Translate the following English presentation sentences into natural, concise Chinese.\n\n"
    prompt += "Return ONLY a valid JSON array.\n"
    prompt += "Do not use markdown.\n"
    prompt += "Do not add explanations.\n\n"
    prompt += "Input:\n"
    prompt += json.dumps(batch, ensure_ascii=False, indent=2)
    prompt += "\n\nOutput format:\n"
    prompt += """[
  {"index": 0, "zh": "早上好"},
  {"index": 1, "zh": "尊敬的来宾、同事们、女士们、先生们"}
]"""

    try:
        t_call = time.time()
        result = subprocess.run(
            [GEMINI_PATH, "-p", prompt],
            capture_output=True, text=True, check=True
        )
        print(f"[TIMER] Gemini CLI translation call took {time.time() - t_call:.3f}s for {len(batch)} items")
        output = result.stdout.strip()
        json_match = re.search(r'\[.*\]', output, re.DOTALL)
        if json_match:
            output = json_match.group(0)
        return json.loads(output)
    except Exception as e:
        print(f"Fast batch translation failed: {e}")
        return []

def process_translation_engine(manifest_path, run_id, engine="gemini"):
    status_data = {
        "run_id": run_id,
        "status": "running",
        "engine": engine,
        "total_chunks": 2 if engine == "gemini" else 1,
        "completed_chunks": 0,
        "percent": 0,
        "message": "Analyzing cache...",
        "updated_at": str(time.time())
    }
    update_status(run_id, status_data)

    if not os.path.exists(manifest_path):
        status_data.update({"status": "failed", "message": "Manifest not found"})
        update_status(run_id, status_data)
        return
        
    with open(manifest_path, 'r') as f:
        manifest = json.load(f)
        
    cache = load_cache()
    sentences = manifest.get('sentences', [])
    pending_sentences = []
    
    hits = 0
    misses = 0
    
    for s in sentences:
        if s.get('zh_status') == 'done':
            hits += 1
            continue
            
        h = get_hash(engine, s['en'])
        if h in cache:
            c = cache[h]
            s['zh'] = c['zh']
            s['zh_segments'] = [{
                "text": c['zh'],
                "start_word": 0,
                "end_word": max(0, len(s.get('words', [])) - 1)
            }]
            s['zh_status'] = 'done'
            hits += 1
        else:
            pending_sentences.append(s)
            misses += 1
            
    print(f"[FAST ZH] Engine: {engine}, Cache hits: {hits}, misses: {misses}")
    
    # 立刻把命中的写回 manifest
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    if misses == 0:
        translated_count = sum(1 for x in manifest['sentences'] if x.get('zh_status') == 'done')
        history_manager.add_or_update_run(run_id, translated_count=translated_count, translation_engine=engine)
        status_data.update({"status": "done", "percent": 100, "message": "All sentences loaded from cache."})
        update_status(run_id, status_data)
        return

    def apply_results(batch, resp_array):
        resp_dict = {item.get('index'): item for item in resp_array if isinstance(item, dict)}
        for s in batch:
            idx = s['index']
            target_s = next((x for x in manifest['sentences'] if x['index'] == idx), None)
            if not target_s: continue
            
            if idx in resp_dict and resp_dict[idx].get('zh'):
                translated_zh = resp_dict[idx]['zh']
                target_s['zh'] = translated_zh
                target_s['zh_segments'] = [{
                    "text": translated_zh,
                    "start_word": 0,
                    "end_word": max(0, len(target_s.get('words', [])) - 1)
                }]
                target_s['zh_status'] = 'done'
                h = get_hash(engine, target_s['en'])
                cache[h] = {"zh": translated_zh, "engine": engine, "updated_at": str(time.time())}
            else:
                target_s['zh'] = ''
                target_s['zh_segments'] = []
                target_s['zh_status'] = 'failed'

    try:
        if engine == "gemini":
            mid = len(pending_sentences) // 2
            chunk1 = pending_sentences[:mid] if mid > 0 else pending_sentences
            chunk2 = pending_sentences[mid:] if mid > 0 else []
            chunks = [chunk1, chunk2] if chunk2 else [chunk1]
            
            status_data.update({"total_chunks": len(chunks), "message": "Translating chunks..."})
            update_status(run_id, status_data)

            for i, chunk in enumerate(chunks):
                if not chunk: continue
                req_batch = [{"index": s['index'], "en": s['en']} for s in chunk]
                resp_array = fast_translate_sentences_gemini(req_batch)
                apply_results(chunk, resp_array)
                
                with open(manifest_path, 'w') as f:
                    json.dump(manifest, f, indent=2, ensure_ascii=False)
                save_cache(cache)
                
                translated_count = sum(1 for x in manifest['sentences'] if x.get('zh_status') == 'done')
                history_manager.add_or_update_run(run_id, translated_count=translated_count, translation_engine=engine)
                
                status_data.update({
                    "completed_chunks": i + 1,
                    "percent": int((i + 1) / len(chunks) * 100),
                    "message": f"Chunk {i + 1} completed"
                })
                update_status(run_id, status_data)

        elif engine == "fast":
            status_data.update({"message": "Using Fast Translator..."})
            update_status(run_id, status_data)
            
            req_batch = [{"index": s['index'], "en": s['en']} for s in pending_sentences]
            resp_array = translate_fast_sentences(req_batch)
            apply_results(pending_sentences, resp_array)
            
            with open(manifest_path, 'w') as f:
                json.dump(manifest, f, indent=2, ensure_ascii=False)
            save_cache(cache)
            
            translated_count = sum(1 for x in manifest['sentences'] if x.get('zh_status') == 'done')
            history_manager.add_or_update_run(run_id, translated_count=translated_count, translation_engine=engine)
            
            status_data.update({"completed_chunks": 1, "percent": 100})
            update_status(run_id, status_data)

        elif engine == "argos":
            if not check_argos_installed():
                status_data.update({"status": "failed", "message": "Argos English-Chinese model not installed. Install via argospm."})
                update_status(run_id, status_data)
                return
                
            status_data.update({"message": "Using Argos Offline Translator..."})
            update_status(run_id, status_data)
            
            req_batch = [{"index": s['index'], "en": s['en']} for s in pending_sentences]
            resp_array = translate_argos_sentences(req_batch)
            apply_results(pending_sentences, resp_array)
            
            with open(manifest_path, 'w') as f:
                json.dump(manifest, f, indent=2, ensure_ascii=False)
            save_cache(cache)
            
            translated_count = sum(1 for x in manifest['sentences'] if x.get('zh_status') == 'done')
            history_manager.add_or_update_run(run_id, translated_count=translated_count, translation_engine=engine)
            
            status_data.update({"completed_chunks": 1, "percent": 100})
            update_status(run_id, status_data)

        status_data.update({"status": "done", "percent": 100, "message": "Translation completed"})
        update_status(run_id, status_data)
        
    except Exception as e:
        print(f"Translation process failed: {e}")
        status_data.update({"status": "failed", "message": str(e)})
        update_status(run_id, status_data)
