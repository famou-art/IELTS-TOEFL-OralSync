import os
import json
import datetime

HISTORY_FILE = "runs/history_index.json"

def get_now_str():
    return datetime.datetime.now().isoformat()[:19]

def load_history():
    if not os.path.exists(HISTORY_FILE):
        return []
    try:
        with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return []

def save_history(history_list):
    os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
    tmp = HISTORY_FILE + ".tmp"
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(history_list, f, indent=2, ensure_ascii=False)
    os.replace(tmp, HISTORY_FILE)

def add_or_update_run(run_id, **kwargs):
    history = load_history()
    run = next((r for r in history if r["run_id"] == run_id), None)
    if run:
        run.update(kwargs)
        run["updated_at"] = get_now_str()
    else:
        run = {
            "run_id": run_id,
            "title": kwargs.get("title", "Untitled Practice"),
            "original_filename": kwargs.get("original_filename", ""),
            "created_at": get_now_str(),
            "updated_at": get_now_str(),
            "sentence_count": kwargs.get("sentence_count", 0),
            "translated_count": kwargs.get("translated_count", 0),
            "audio_count": kwargs.get("audio_count", 0),
            "translation_engine": kwargs.get("translation_engine", ""),
            "status": kwargs.get("status", "ready")
        }
        history.insert(0, run)
    
    # Sort by updated_at descending
    history.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    save_history(history)

def delete_run(run_id):
    history = load_history()
    history = [r for r in history if r["run_id"] != run_id]
    save_history(history)
    
def rename_run(run_id, title):
    history = load_history()
    run = next((r for r in history if r["run_id"] == run_id), None)
    if run:
        run["title"] = title
        run["updated_at"] = get_now_str()
        history.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
        save_history(history)
        return True
    return False
