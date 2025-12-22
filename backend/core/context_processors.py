from __future__ import annotations

from typing import Any, Dict

from django.db.models import Sum
from django.http import HttpRequest

from .constants import POST_TEXT_MAX_LENGTH, MAX_ATTACHMENTS_PER_POST
from .models import ChatMember


def unread_messages_count(request: HttpRequest) -> Dict[str, Any]:
    """Adds unread message counter + shared UI constants to every template."""

    if not request.user.is_authenticated:
        return {
            "unread_messages_count": 0,
            "POST_TEXT_MAX_LENGTH": POST_TEXT_MAX_LENGTH,
            "MAX_ATTACHMENTS_PER_POST": MAX_ATTACHMENTS_PER_POST,
        }

    agg = ChatMember.objects.filter(user=request.user, is_hidden=False).aggregate(total=Sum("unread_count"))
    total = int(agg.get("total") or 0)

    return {
        "unread_messages_count": total,
        "POST_TEXT_MAX_LENGTH": POST_TEXT_MAX_LENGTH,
        "MAX_ATTACHMENTS_PER_POST": MAX_ATTACHMENTS_PER_POST,
    }
