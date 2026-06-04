import pysbd

_segmenter = pysbd.Segmenter(language="en", clean=True)

def split_into_sentences(text: str):
    # 将多行文本合并为单行
    text = ' '.join(text.split('\n'))
    # 用 pysbd 分句，正确处理 Mr. e.g. Jan. 等缩写
    return [s.strip() for s in _segmenter.segment(text) if s.strip()]
