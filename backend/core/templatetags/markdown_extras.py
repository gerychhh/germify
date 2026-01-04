# core/templatetags/markdown_extras.py
from django import template
from django.urls import reverse
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

# Оборачиваем хэштеги #python в кликабельные ссылки, но НЕ трогаем заголовки "# Заголовок"
# и не лезем внутрь fenced-code блоков ```...``` и inline-code `...`
_HASHTAG_LINK_RE = re.compile(r"(?<!\\)(?<![\w-])#(?P<tag>[\w-]+)", re.UNICODE)


def _linkify_hashtags(text: str) -> str:
    if not text:
        return ""

    feed_url = reverse("feed")
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
            parts[i] = _HASHTAG_LINK_RE.sub(
                lambda m: (
                    f"<a class=\"post-hashtag\" href=\"{feed_url}?q=%23{m.group('tag')}\" "
                    f"data-hashtag=\"{m.group('tag')}\">#{m.group('tag')}</a>"
                ),
                parts[i],
            )
        out_lines.append("`".join(parts))

    return "".join(out_lines)


@register.filter(name="md")
def md_filter(text):
    text = text or ""
    text = _linkify_hashtags(text)

    html = md.markdown(
        text,
        extensions=_MD_EXTENSIONS,
        extension_configs=_MD_CONFIG,
        output_format="html5",
    )
    return mark_safe(html)
