import os
import edge_tts
import asyncio

VOICE = os.getenv("DEFAULT_TTS_VOICE", "en-US-ChristopherNeural")
RATE = os.getenv("DEFAULT_TTS_RATE", "-10%")

async def generate_tts_with_timestamps(text: str, output_mp3: str):
    """
    流式调用 edge-tts，同时写入音频文件并收集单词级别的时间戳。
    每个句子的时间戳都从 0 开始。
    """
    # 必须显式指定 boundary="WordBoundary"，否则默认只返回 SentenceBoundary
    communicate = edge_tts.Communicate(text, VOICE, rate=RATE, boundary="WordBoundary")
    audio_data = bytearray()
    words = []

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            # 收集音频二进制数据
            audio_data.extend(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            # edge-tts 的 offset 和 duration 单位为 ticks（1 tick = 100 纳秒）
            start_sec = chunk["offset"] / 10_000_000.0
            duration_sec = chunk["duration"] / 10_000_000.0
            word_text = chunk["text"]

            words.append({
                "text": word_text,
                "start": round(start_sec, 3),
                "end": round(start_sec + duration_sec, 3)
            })

    # 将合并后的音频数据写入本地 mp3
    with open(output_mp3, "wb") as f:
        f.write(audio_data)

    return words
