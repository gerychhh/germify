# core/templatetags/markdown_extras.py
from django import template
from django.utils.safestring import mark_safe

import re
import markdown as md

register = template.Library()

_MD_EXTENSIONS = [
    "fenced_code",   # ```code```
    "codehilite",    # подсветка через Pygments
    "tables",
    "sane_lists",
    "nl2br",
]

_MD_CONFIG = {
    "codehilite": {
        "guess_lang": False,   # не угадывать язык (чтобы не было “рандомной” подсветки)
        "linenums": True,      # нумерация строк
        "noclasses": False,    # токены в CSS-классах (мы сами зададим тёмную тему)
        "css_class": "codehilite",
    }
}

# Экранируем # только когда это "хэштег" (#питон), но НЕ трогаем заголовки "# Заголовок"
# и не лезем внутрь fenced-code блоков ```...``` и inline-code `...`
_HASHTAG_IN_TEXT_RE = re.compile(r"(?<!\\)#(?=[\w-])", re.UNICODE)


def _escape_hashtags_for_markdown(text: str) -> str:
    if not text:
        return ""

    out_lines = []
    in_fence = False

    for line in text.splitlines(keepends=True):
        s = line.lstrip()

        # fenced code start/end (``` or ```python)
        if s.startswith("```"):
            in_fence = not in_fence
            out_lines.append(line)
            continue

        if in_fence:
            out_lines.append(line)
            continue

        # вне fenced: не трогаем inline code между `...`
        parts = line.split("`")
        for i in range(0, len(parts), 2):  # только не-кодовые сегменты
            parts[i] = _HASHTAG_IN_TEXT_RE.sub(r"\#", parts[i])
        out_lines.append("`".join(parts))

    return "".join(out_lines)


@register.filter(name="md")
def md_filter(text):
    text = text or ""
    text = _escape_hashtags_for_markdown(text)

    html = md.markdown(
        text,
        extensions=_MD_EXTENSIONS,
        extension_configs=_MD_CONFIG,
        output_format="html5",
    )
    return mark_safe(html)
