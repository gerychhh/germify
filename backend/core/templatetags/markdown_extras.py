# core/templatetags/markdown_extras.py
from django import template
from django.utils.safestring import mark_safe

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

@register.filter(name="md")
def md_filter(text):
    text = text or ""
    html = md.markdown(
        text,
        extensions=_MD_EXTENSIONS,
        extension_configs=_MD_CONFIG,
        output_format="html5",
    )
    return mark_safe(html)
