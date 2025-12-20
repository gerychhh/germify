from typing import Any, Dict, List

from django.db.models import Q

from core.models import Message


def build_threads_for_user(user) -> List[Dict[str, Any]]:
    """Build a dialogs list for the given user.

    Returns:
        A list ordered by last message desc, with unique "other_user".
    """

    qs = (
        Message.objects
        .filter(Q(sender=user) | Q(recipient=user))
        .select_related("sender", "recipient")
        .order_by("-created_at")
    )

    threads: List[Dict[str, Any]] = []
    seen_ids = set()

    for msg in qs:
        other = msg.recipient if msg.sender == user else msg.sender
        if other.id in seen_ids:
            continue

        unread_count = Message.objects.filter(
            sender=other,
            recipient=user,
            is_read=False,
        ).count()

        threads.append({
            "other_user": other,
            "last_message": msg,
            "unread_count": unread_count,
        })
        seen_ids.add(other.id)

    return threads
