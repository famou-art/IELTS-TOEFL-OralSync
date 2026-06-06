import pysbd
import re

_segmenter = pysbd.Segmenter(language="en", clean=True)

def _is_mostly_chinese(s: str) -> bool:
    """判断字符串是否以中文内容为主（中文字符占比超过 40%）"""
    if not s:
        return False
    chinese_chars = sum(1 for c in s if '\u4e00' <= c <= '\u9fff')
    return chinese_chars / len(s) > 0.4

def split_into_sentences(text: str) -> list[str]:
    # 逐行预处理：去掉 Markdown blockquote（> 开头，通常是中文翻译行）
    # 和 Markdown 标题/分割线
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith('>'):          # blockquote → 中文翻译，跳过
            continue
        if stripped.startswith('#'):          # Markdown 标题，跳过
            continue
        if re.match(r'^-{3,}$', stripped):    # 分割线，跳过
            continue
        lines.append(stripped)

    cleaned = ' '.join(lines)

    # 用 pysbd 分句，正确处理 Mr. e.g. Jan. 等缩写
    sentences = _segmenter.segment(cleaned)

    # 最终再过滤：去掉以中文为主的句子（双重保险）
    result = []
    for s in sentences:
        s = s.strip()
        if not s:
            continue
        if _is_mostly_chinese(s):
            continue
        result.append(s)

    return result
