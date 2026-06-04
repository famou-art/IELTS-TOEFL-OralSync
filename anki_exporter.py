import os
import json
import re
import tempfile
import genanki

# 固定 Model/Deck ID（随机生成一次，保持稳定）
SENTENCE_MODEL_ID = 1607392319
VOCAB_MODEL_ID    = 1607392320
DECK_ID_BASE      = 2059400110

SENTENCE_MODEL = genanki.Model(
    SENTENCE_MODEL_ID,
    "OralPractice Sentence",
    fields=[
        {"name": "Chinese"},
        {"name": "English"},
        {"name": "Audio"},
    ],
    templates=[
        {
            "name": "ZH → EN + Audio",
            "qfmt": "{{Chinese}}",
            "afmt": "{{FrontSide}}<hr>{{English}}<br>{{Audio}}",
        },
    ],
    css="""
        .card { font-family: 'Noto Sans SC', sans-serif; font-size: 20px; text-align: center; }
        .card:first-child { background: #fafafa; }
        hr { border: none; border-top: 1px solid #ddd; margin: 12px 0; }
    """,
)

VOCAB_MODEL = genanki.Model(
    VOCAB_MODEL_ID,
    "OralPractice Vocab",
    fields=[
        {"name": "Word"},
        {"name": "IPA"},
        {"name": "POS"},
        {"name": "Chinese"},
    ],
    templates=[
        {
            "name": "EN → ZH",
            "qfmt": "{{Word}}<br><span style='color:#888;font-size:14px'>{{IPA}}</span>",
            "afmt": "{{FrontSide}}<hr><span style='color:#e53e3e;font-style:italic'>{{POS}}</span> {{Chinese}}",
        },
    ],
    css="""
        .card { font-family: 'Noto Sans SC', sans-serif; font-size: 22px; text-align: center; }
        hr { border: none; border-top: 1px solid #ddd; margin: 12px 0; }
    """,
)


def export_anki(run_id: str):
    """
    将一个 run 的所有句子 + 词汇打包为 Anki .apkg 文件。
    句子卡：中文 → 英文 + 音频
    词汇卡：单词 + IPA → 词性 + 中文
    """
    from fastapi.responses import FileResponse, JSONResponse

    base_dir = f"runs/{run_id}"
    manifest_path = os.path.join(base_dir, "manifest.json")
    if not os.path.exists(manifest_path):
        return JSONResponse({"error": "Manifest not found"}, status_code=404)

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    sentences = manifest.get("sentences", [])
    vocab = manifest.get("vocab", {})

    # 检查是否有翻译
    has_zh = any(s.get("zh") for s in sentences)
    if not has_zh:
        return JSONResponse(
            {"error": "No Chinese translation found. Please generate Chinese first."},
            status_code=400,
        )

    deck_name = f"OralPractice::{run_id}"
    deck = genanki.Deck(DECK_ID_BASE + abs(hash(run_id)) % 10000, deck_name)

    media_files = []

    # ── 句子卡 ──────────────────────────────────────────
    for s in sentences:
        idx = s.get("index", 0)
        zh = s.get("zh", "")
        en = s.get("en", "")
        if not zh or not en:
            continue

        audio_src = os.path.join(base_dir, "audio", f"{idx:04d}.mp3")
        audio_field = ""
        if os.path.exists(audio_src):
            # Anki media 文件名不能有目录，加 run_id 前缀防冲突
            media_name = f"op_{run_id}_{idx:04d}.mp3"
            media_files.append((audio_src, media_name))
            audio_field = f"[sound:{media_name}]"

        note = genanki.Note(
            model=SENTENCE_MODEL,
            fields=[zh, en, audio_field],
            guid=genanki.guid_for(run_id, "sentence", idx),
        )
        deck.add_note(note)

    # ── 词汇卡 ──────────────────────────────────────────
    for w in vocab.get("core_words", []):
        word = w.get("word", "")
        ipa  = w.get("ipa", "")
        pos  = w.get("pos", "")
        zh   = w.get("zh", "")
        if not word or not zh:
            continue
        note = genanki.Note(
            model=VOCAB_MODEL,
            fields=[word, ipa, pos, zh],
            guid=genanki.guid_for(run_id, "vocab", word),
        )
        deck.add_note(note)

    # ── 打包 .apkg ──────────────────────────────────────
    export_dir = os.path.join(base_dir, "exports")
    os.makedirs(export_dir, exist_ok=True)
    apkg_path = os.path.join(export_dir, f"practice_{run_id}.apkg")

    pkg = genanki.Package(deck)
    # 添加音频 media（genanki 接受绝对路径列表）
    pkg.media_files = [src for src, _ in media_files]

    # genanki 会把 media 文件用原始文件名打包，需要手动重命名
    # 方案：先复制到 tmp 目录再打包
    with tempfile.TemporaryDirectory() as tmpdir:
        renamed = []
        for src, media_name in media_files:
            dst = os.path.join(tmpdir, media_name)
            import shutil
            shutil.copy2(src, dst)
            renamed.append(dst)
        pkg.media_files = renamed
        pkg.write_to_file(apkg_path)

    return FileResponse(
        apkg_path,
        filename=f"practice_{run_id}.apkg",
        media_type="application/octet-stream",
    )
