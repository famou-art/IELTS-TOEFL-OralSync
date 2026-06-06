import concurrent.futures
from deep_translator import GoogleTranslator

def translate_fast_sentences(sentences, max_workers=5):
    """
    并发翻译句子列表。
    注意：GoogleTranslator 不是线程安全的（共享内部 session 会导致
    响应交叉污染，出现 A 句子得到 B 翻译的 bug）。
    修复方案：每个线程独立创建自己的 translator 实例。
    """
    def _translate(s):
        try:
            # 每个线程独立实例，避免共享 session 污染
            tr = GoogleTranslator(source="en", target="zh-CN")
            zh = tr.translate(s["en"])
            return {"index": s["index"], "zh": zh or ""}
        except Exception as e:
            print(f"Fast translator failed for index {s['index']}: {e}")
            return {"index": s["index"], "zh": ""}

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        # 保持有序列表，future[i] 对应 sentences[i]，结果顺序确定
        futures = [executor.submit(_translate, s) for s in sentences]
        results = [f.result() for f in futures]

    return results
