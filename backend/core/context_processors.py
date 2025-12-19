from .models import Message
from .constants import POST_TEXT_MAX_LENGTH, MAX_ATTACHMENTS_PER_POST


def unread_messages_count(request):
    """Adds unread message counter + shared UI constants to every template."""

    if not request.user.is_authenticated:
        return {
            "unread_messages_count": 0,
            "POST_TEXT_MAX_LENGTH": POST_TEXT_MAX_LENGTH,
            "MAX_ATTACHMENTS_PER_POST": MAX_ATTACHMENTS_PER_POST,
        }

    total = Message.objects.filter(
        recipient=request.user,
        is_read=False,
    ).count()

    return {
        "unread_messages_count": total,
        "POST_TEXT_MAX_LENGTH": POST_TEXT_MAX_LENGTH,
        "MAX_ATTACHMENTS_PER_POST": MAX_ATTACHMENTS_PER_POST,
    }
