import concurrent.futures
from deep_translator import GoogleTranslator

def translate_fast_sentences(sentences, max_workers=5):
    translator = GoogleTranslator(source="en", target="zh-CN")
    results = []
    
    def _translate(s):
        try:
            zh = translator.translate(s["en"])
            return {"index": s["index"], "zh": zh}
        except Exception as e:
            print(f"Fast translator failed for {s['index']}: {e}")
            return {"index": s["index"], "zh": ""}
            
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(_translate, s): s for s in sentences}
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())
            
    return results
