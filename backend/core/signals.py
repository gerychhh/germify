from __future__ import annotations

from typing import Any, Dict

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.template.loader import render_to_string
from django.test.client import RequestFactory

from core.models import Message
from core.services.messages import build_threads_for_user
from core.consumers import user_group_name

_rf = RequestFactory()


def _render_for_user(user, template_name: str, context: Dict[str, Any]) -> str:
    """Render template with request.user set for correct 'me/other' markup."""

    req = _rf.get("/")
    req.user = user
    return render_to_string(template_name, context, request=req)


def _send_to_user(user_id: int, payload: Dict[str, Any]) -> None:
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    async_to_sync(channel_layer.group_send)(
        user_group_name(user_id),
        {
            "type": "notify",
            "payload": payload,
        },
    )


@receiver(post_save, sender=Message)
def message_created_notify(sender, instance: Message, created: bool, **kwargs: Any) -> None:
    """Push websocket events when a new message is created."""

    if not created:
        return

    msg = instance

    # Render message item for each side (different CSS class 'me/other').
    html_for_recipient = _render_for_user(
        msg.recipient,
        "core/partials/message_item.html",
        {"message": msg},
    )
    html_for_sender = _render_for_user(
        msg.sender,
        "core/partials/message_item.html",
        {"message": msg},
    )

    # Refresh inbox list HTML for both users.
    recipient_threads = build_threads_for_user(msg.recipient)
    sender_threads = build_threads_for_user(msg.sender)

    inbox_html_for_recipient = _render_for_user(
        msg.recipient,
        "core/partials/messages_inbox_list.html",
        {"threads": recipient_threads},
    )
    inbox_html_for_sender = _render_for_user(
        msg.sender,
        "core/partials/messages_inbox_list.html",
        {"threads": sender_threads},
    )

    # Unread totals (after creation).
    recipient_unread_total = Message.objects.filter(
        recipient=msg.recipient,
        is_read=False,
    ).count()
    sender_unread_total = Message.objects.filter(
        recipient=msg.sender,
        is_read=False,
    ).count()

    # Recipient payload
    _send_to_user(
        msg.recipient_id,
        {
            "type": "message_new",
            "message_id": msg.id,
            "other_username": msg.sender.username,
            "html": html_for_recipient,
            "inbox_html": inbox_html_for_recipient,
            "unread_total": recipient_unread_total,
            "incoming": True,
        },
    )

    # Sender payload (needed for other tabs/devices)
    _send_to_user(
        msg.sender_id,
        {
            "type": "message_new",
            "message_id": msg.id,
            "other_username": msg.recipient.username,
            "html": html_for_sender,
            "inbox_html": inbox_html_for_sender,
            "unread_total": sender_unread_total,
            "incoming": False,
        },
    )
