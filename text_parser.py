import re

def split_into_sentences(text: str):
    # 将换行替换为空格
    text = text.replace('\n', ' ')
    # 简易英文分句逻辑（根据. ! ?和后跟的空格进行切割）
    raw_sentences = re.split(r'(?<=[.!?])\s+', text)
    # 去除空白句
    sentences = [s.strip() for s in raw_sentences if s.strip()]
    return sentences
