try:
    import argostranslate.package
    import argostranslate.translate
except ImportError:
    argostranslate = None

def check_argos_installed():
    if not argostranslate:
        return False
    installed_languages = argostranslate.translate.get_installed_languages()
    # Check if 'en' and 'zh' are among the installed languages
    codes = [lang.code for lang in installed_languages]
    return "en" in codes and "zh" in codes

def translate_argos_sentences(sentences):
    if not check_argos_installed():
        raise Exception("Argos English-Chinese model not installed.")
    
    installed_languages = argostranslate.translate.get_installed_languages()
    from_lang = list(filter(lambda x: x.code == 'en', installed_languages))[0]
    to_lang = list(filter(lambda x: x.code == 'zh', installed_languages))[0]
    translation = from_lang.get_translation(to_lang)
    
    results = []
    for s in sentences:
        try:
            zh = translation.translate(s["en"])
            results.append({"index": s["index"], "zh": zh})
        except Exception as e:
            print(f"Argos translator failed for {s['index']}: {e}")
            results.append({"index": s["index"], "zh": ""})
            
    return results
