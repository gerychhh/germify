from __future__ import annotations

from typing import Any, Dict

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.template.loader import render_to_string
from django.test.client import RequestFactory
from django.db.models import F
from django.db import transaction

from core.consumers import user_group_name
from core.models import Chat, ChatMember, ChatMessage
from core.services.messages import build_threads_for_user, get_other_user_for_dm, get_unread_total

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


@receiver(post_save, sender=ChatMessage)
def chat_message_created_notify(sender, instance: ChatMessage, created: bool, **kwargs: Any) -> None:
    """Push websocket events when a new chat message is created."""

    if not created:
        return

    # Важно: сообщение может иметь вложения, которые создаются сразу после ChatMessage.
    # Чтобы websocket-уведомление улетало уже с готовыми вложениями, отложим отправку
    # до коммита транзакции.
    msg_id = instance.id

    def _notify() -> None:
        msg = (
            ChatMessage.objects.select_related("chat")
            .prefetch_related("attachments")
            .get(id=msg_id)
        )
        chat = msg.chat

        # Update denormalized chat fields
        Chat.objects.filter(id=chat.id).update(last_message_at=msg.created_at, last_message_id=msg.id)

        # Increment unread counters for everyone except sender
        ChatMember.objects.filter(chat_id=chat.id).exclude(user_id=msg.sender_id).update(
            unread_count=F("unread_count") + 1
        )

        memberships = (
            ChatMember.objects.filter(chat_id=chat.id, is_hidden=False)
            .select_related(
                "user",
                "chat",
                "chat__dm_user1",
                "chat__dm_user2",
            )
        )

        for member in memberships:
            user = member.user
            other_user = get_other_user_for_dm(chat, user)

            html = _render_for_user(
                user,
                "core/partials/message_item.html",
                {"message": msg, "chat": chat, "other_user": other_user},
            )

            threads = build_threads_for_user(user)
            inbox_html = _render_for_user(
                user,
                "core/partials/messages_inbox_list.html",
                {"threads": threads},
            )

            unread_total = get_unread_total(user)

            payload: Dict[str, Any] = {
                "type": "message_new",
                "message_id": msg.id,
                "chat_id": chat.id,
                "chat_kind": chat.kind,
                "html": html,
                "inbox_html": inbox_html,
                "unread_total": unread_total,
                "incoming": user.id != msg.sender_id,
            }

            if other_user is not None:
                payload["other_username"] = other_user.username

            _send_to_user(user.id, payload)

    transaction.on_commit(_notify)
