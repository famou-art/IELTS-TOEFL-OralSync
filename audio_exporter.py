import os
import zipfile
import subprocess
import shutil
from fastapi.responses import FileResponse, JSONResponse

def check_ffmpeg():
    return shutil.which("ffmpeg") is not None

def export_current_sentence(run_id, index, fmt):
    base_dir = f"runs/{run_id}"
    audio_path = f"{base_dir}/audio/{index:04d}.mp3"
    
    if not os.path.exists(audio_path):
        return JSONResponse({"error": "Audio not found"}, status_code=404)
        
    if fmt == "mp3":
        return FileResponse(audio_path, filename=f"sentence_{index:04d}.mp3")
        
    if not check_ffmpeg():
        return JSONResponse({"error": "ffmpeg not found. Please install ffmpeg to use wav/m4a formats."}, status_code=500)
        
    export_dir = f"{base_dir}/exports"
    os.makedirs(export_dir, exist_ok=True)
    out_path = f"{export_dir}/sentence_{index:04d}.{fmt}"
    
    if not os.path.exists(out_path):
        subprocess.run(["ffmpeg", "-y", "-i", audio_path, out_path], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
    return FileResponse(out_path, filename=f"sentence_{index:04d}.{fmt}")

def export_all_zip(run_id, fmt):
    base_dir = f"runs/{run_id}"
    export_dir = f"{base_dir}/exports"
    os.makedirs(export_dir, exist_ok=True)
    
    zip_path = f"{export_dir}/all_sentences_{fmt}.zip"
    if os.path.exists(zip_path):
        return FileResponse(zip_path, filename=f"all_sentences_{fmt}.zip")
        
    if fmt != "mp3" and not check_ffmpeg():
        return JSONResponse({"error": "ffmpeg not found. Please install ffmpeg to use wav/m4a formats."}, status_code=500)
        
    with zipfile.ZipFile(zip_path, 'w') as zipf:
        audio_dir = f"{base_dir}/audio"
        for f in sorted(os.listdir(audio_dir)):
            if f.endswith(".mp3"):
                file_path = os.path.join(audio_dir, f)
                if fmt == "mp3":
                    zipf.write(file_path, arcname=f)
                else:
                    name_base = f.replace(".mp3", "")
                    out_f = f"{export_dir}/tmp_{name_base}.{fmt}"
                    subprocess.run(["ffmpeg", "-y", "-i", file_path, out_f], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    zipf.write(out_f, arcname=f"{name_base}.{fmt}")
                    if os.path.exists(out_f):
                        os.remove(out_f)
                    
    return FileResponse(zip_path, filename=f"all_sentences_{fmt}.zip")

def export_merged(run_id, fmt):
    base_dir = f"runs/{run_id}"
    export_dir = f"{base_dir}/exports"
    os.makedirs(export_dir, exist_ok=True)
    
    merged_mp3 = f"{export_dir}/merged.mp3"
    
    if not os.path.exists(merged_mp3):
        audio_dir = f"{base_dir}/audio"
        with open(merged_mp3, "wb") as outfile:
            for f in sorted(os.listdir(audio_dir)):
                if f.endswith(".mp3"):
                    with open(os.path.join(audio_dir, f), "rb") as infile:
                        outfile.write(infile.read())
                        
    if fmt == "mp3":
        return FileResponse(merged_mp3, filename="merged_practice.mp3")
        
    if not check_ffmpeg():
        return JSONResponse({"error": "ffmpeg not found. Please install ffmpeg to use wav/m4a formats."}, status_code=500)
        
    out_path = f"{export_dir}/merged_practice.{fmt}"
    if not os.path.exists(out_path):
        subprocess.run(["ffmpeg", "-y", "-i", merged_mp3, out_path], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
    return FileResponse(out_path, filename=f"merged_practice.{fmt}")
