import re
from collections import Counter
import json
import os
import subprocess
import eng_to_ipa as p

GLOBAL_CACHE_DIR = "runs/global_cache"
VOCAB_CACHE_FILE = os.path.join(GLOBAL_CACHE_DIR, "vocab_cache.json")
GEMINI_PATH = os.getenv("GEMINI_CLI_COMMAND", "gemini")

os.makedirs(GLOBAL_CACHE_DIR, exist_ok=True)

# 更严格的停用词和低价值词
STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", 
    "to", "in", "for", "on", "with", "at", "by", "from", "up", "about", 
    "into", "over", "after", "i", "you", "he", "she", "it", "we", "they", 
    "this", "that", "it's", "do", "does", "did", "have", "has", "had", 
    "can", "could", "of", "as", "be", "not", "so", "if", "my", "your", 
    "his", "her", "their", "our", "all", "any", "some", "what", "which", 
    "who", "how", "when", "where", "why", "there", "then", "out", "very", "just",
    "will", "today", "first", "let", "between", "following", "high", "low",
    "these", "those", "because", "also", "would", "should", "only", "many", "much"
}

def load_vocab_cache():
    if os.path.exists(VOCAB_CACHE_FILE):
        try:
            with open(VOCAB_CACHE_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {}

def save_vocab_cache(cache):
    temp_file = VOCAB_CACHE_FILE + ".tmp"
    with open(temp_file, 'w') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
    os.replace(temp_file, VOCAB_CACHE_FILE)

def extract_vocabulary(text: str):
    words = re.findall(r'\b[a-zA-Z]{4,}\b', text.lower())
    filtered_words = [w for w in words if w not in STOPWORDS]
    
    word_counts = Counter(filtered_words)
    raw_core_words = [w for w, c in word_counts.most_common(20)]
    
    bigrams = [f"{filtered_words[i]} {filtered_words[i+1]}" for i in range(len(filtered_words)-1)]
    bigram_counts = Counter(bigrams)
    raw_core_phrases = [p for p, c in bigram_counts.most_common(10)]
    
    cache = load_vocab_cache()
    
    core_words = []
    core_phrases = []
    
    needs_translation = False
    
    for word in raw_core_words:
        item = {"word": word, "ipa": "", "zh": "", "pos": ""}
        if word in cache:
            item = cache[word]
        else:
            try:
                ipa_res = p.convert(word)
                if not ipa_res.endswith("*"): # ipa* means unknown in eng_to_ipa
                    item["ipa"] = f"/{ipa_res}/"
            except:
                pass
            needs_translation = True
        core_words.append(item)
        
    for phrase in raw_core_phrases:
        item = {"phrase": phrase, "zh": ""}
        if phrase in cache:
            item = cache[phrase]
        else:
            needs_translation = True
        core_phrases.append(item)
        
    # Vocab 翻译可以直接在这里同步调用，因为数量极少，而且由于缓存机制大部分情况下是秒级，即使不在FastMode内
    # 为了遵循极致 Fast Mode，我们将使用一次性批量查询
    if needs_translation:
        try:
            to_translate = {
                "words": [w["word"] for w in core_words if not w.get("zh")],
                "phrases": [p["phrase"] for p in core_phrases if not p.get("zh")]
            }
            if to_translate["words"] or to_translate["phrases"]:
                prompt = "Provide a strict JSON response ONLY. No markdown formatting.\n"
                prompt += "Translate the following words and phrases. Provide POS (Part of Speech like adj. n. v.) for words.\n"
                prompt += "Input:\n" + json.dumps(to_translate) + "\n\n"
                prompt += "Output format:\n"
                prompt += '{"words": {"empirical": {"zh": "实证的", "pos": "adj."}}, "phrases": {"theoretical framework": {"zh": "理论框架"}}}\n'
                
                res = subprocess.run([GEMINI_PATH, "-p", prompt], capture_output=True, text=True, check=True)
                out = res.stdout.strip()
                json_match = re.search(r'\{.*\}', out, re.DOTALL)
                if json_match:
                    parsed = json.loads(json_match.group(0))
                    for cw in core_words:
                        if cw["word"] in parsed.get("words", {}):
                            cw["zh"] = parsed["words"][cw["word"]].get("zh", "")
                            cw["pos"] = parsed["words"][cw["word"]].get("pos", "")
                            cache[cw["word"]] = cw
                    for cp in core_phrases:
                        if cp["phrase"] in parsed.get("phrases", {}):
                            cp["zh"] = parsed["phrases"][cp["phrase"]].get("zh", "")
                            cache[cp["phrase"]] = cp
                    save_vocab_cache(cache)
        except Exception as e:
            print(f"Vocab translation failed: {e}")

    return {
        "core_words": core_words,
        "core_phrases": core_phrases
    }
