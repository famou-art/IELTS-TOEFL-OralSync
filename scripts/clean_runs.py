import os
import shutil

RUNS_DIR = "runs"

if os.path.exists(RUNS_DIR):
    for item in os.listdir(RUNS_DIR):
        if item == ".gitkeep":
            continue
        item_path = os.path.join(RUNS_DIR, item)
        if os.path.isdir(item_path):
            shutil.rmtree(item_path)
        else:
            os.remove(item_path)
    print("Cleaned runs directory.")
else:
    print("Runs directory not found.")
