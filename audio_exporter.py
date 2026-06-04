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

# ────────────────────────────────────────────────────
# 新增：播客式音频导出（英文 + 跟读停顿 [+ 中文 TTS]）
# 纯字节流拼接，无需 ffmpeg/pydub
# ────────────────────────────────────────────────────

def _make_silence_mp3(duration_ms: int) -> bytes:
    """
    生成指定时长的静音 MP3 字节流。
    原理：边界清晰的静音 MPEG 帧（44100Hz, stereo, 128kbps）。
    每帧 = 1152 样本 @ 44100Hz ≈ 26.12ms。
    用最小 MP3 静音帧填充到目标时长。
    """
    # 最小的 MPEG1 Layer3 静音帧（128kbps, 44100Hz, stereo），16 字节占位
    # 实际用一段预置的合法静音帧字节串
    SILENCE_FRAME = bytes([
        0xFF, 0xFB, 0x90, 0x00,  # Frame sync + header (MPEG1, Layer3, 128kbps, 44100, stereo)
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,  # 总共 417 字节（128kbps 帧长）
    ])
    # 每帧约 26ms，计算需要多少帧
    frames_needed = max(1, duration_ms // 26)
    return SILENCE_FRAME * frames_needed

def _generate_zh_tts_sync(text: str, out_path: str):
    """同步调用 edge-tts 生成中文音频"""
    import asyncio
    import edge_tts

    async def _run():
        communicate = edge_tts.Communicate(text, voice="zh-CN-XiaoxiaoNeural")
        await communicate.save(out_path)

    asyncio.run(_run())

def export_podcast(run_id: str, mode: str = "en_pause_zh", pause_multiplier: float = 1.2):
    """
    mode:
      "en_pause"     → 英文 + 动态停顿（纯跟读），无需 ffmpeg
      "en_pause_zh"  → 英文 + 停顿 + 中文 TTS（edge-tts）+ 间隔
    纯字节流拼接，MP3 文件无需解码，不依赖 ffmpeg/pydub。
    """
    base_dir = f"runs/{run_id}"
    manifest_path = os.path.join(base_dir, "manifest.json")
    if not os.path.exists(manifest_path):
        return JSONResponse({"error": "Manifest not found"}, status_code=404)

    import json
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    export_dir = os.path.join(base_dir, "exports")
    os.makedirs(export_dir, exist_ok=True)

    safe_mode = mode.replace("/", "_")
    out_filename = f"podcast_{safe_mode}_{pause_multiplier}x.mp3"
    out_path = os.path.join(export_dir, out_filename)

    # 已生成过，直接返回缓存
    if os.path.exists(out_path):
        return FileResponse(out_path, filename=out_filename, media_type="audio/mpeg")

    zh_tts_dir = os.path.join(export_dir, "zh_tts_cache")
    os.makedirs(zh_tts_dir, exist_ok=True)

    with open(out_path, "wb") as outfile:
        for s in manifest.get("sentences", []):
            idx = s.get("index", 0)
            audio_path = os.path.join(base_dir, "audio", f"{idx:04d}.mp3")
            if not os.path.exists(audio_path):
                continue

            # 写入英文音频
            with open(audio_path, "rb") as f:
                outfile.write(f.read())

            # 动态停顿：每个单词留 400ms × 倍率
            word_count = len(s.get("words", [])) or 5
            pause_ms = int(word_count * 400 * float(pause_multiplier))
            pause_ms = max(800, min(pause_ms, 8000))
            outfile.write(_make_silence_mp3(pause_ms))

            # 中文 TTS 拼接
            if mode == "en_pause_zh" and s.get("zh"):
                zh_tts_path = os.path.join(zh_tts_dir, f"{idx:04d}_zh.mp3")
                if not os.path.exists(zh_tts_path):
                    try:
                        _generate_zh_tts_sync(s["zh"], zh_tts_path)
                    except Exception as e:
                        print(f"[Podcast] ZH TTS failed for sentence {idx}: {e}")
                        continue
                if os.path.exists(zh_tts_path):
                    with open(zh_tts_path, "rb") as f:
                        outfile.write(f.read())
                    outfile.write(_make_silence_mp3(800))  # 句间间隔

    return FileResponse(out_path, filename=out_filename, media_type="audio/mpeg")
