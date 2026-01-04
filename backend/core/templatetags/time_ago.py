from __future__ import annotations

from django import template
from django.utils import timezone

register = template.Library()


def _ru_plural(n: int, one: str, few: str, many: str) -> str:
    n = abs(int(n))
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not (12 <= n % 100 <= 14):
        return few
    return many


@register.filter
def time_ago(value):
    """Human-friendly relative time in Russian.

    Rules:
    - < 1 min: "только что"
    - < 60 min: "N минут назад" (точность до минуты)
    - < 24 h:  "N часов назад"  (точность до часа)
    - < 30 d:  "N дней назад"   (точность до дня)
    - < 12 mo: "N месяцев назад" (точность до месяца)
    - else:    "N лет назад"    (точность до года)
    """
    if not value:
        return ""

    now = timezone.now()
    try:
        delta = now - value
    except Exception:
        return ""

    seconds = int(delta.total_seconds())
    if seconds < 0:
        seconds = 0

    if seconds < 60:
        return "только что"

    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes} {_ru_plural(minutes, 'минуту', 'минуты', 'минут')} назад"

    hours = minutes // 60
    if hours < 24:
        return f"{hours} {_ru_plural(hours, 'час', 'часа', 'часов')} назад"

    days = hours // 24
    if days < 30:
        return f"{days} {_ru_plural(days, 'день', 'дня', 'дней')} назад"

    months = days // 30
    if months < 12:
        return f"{months} {_ru_plural(months, 'месяц', 'месяца', 'месяцев')} назад"

    years = days // 365
    if years < 1:
        years = 1
    return f"{years} {_ru_plural(years, 'год', 'года', 'лет')} назад"
