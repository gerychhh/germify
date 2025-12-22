from __future__ import annotations

from typing import Any, Dict, List, Optional

from django.db import transaction
from django.db.models import Sum

from core.models import Chat, ChatMember, ChatMessage, User


def _ordered_pair(a_id: int, b_id: int) -> tuple[int, int]:
    return (a_id, b_id) if a_id < b_id else (b_id, a_id)


def get_or_create_dm_chat(me: User, other: User) -> Chat:
    """Return existing DM chat between two users or create it.

    We store ordered pair (min_id, max_id) to guarantee uniqueness.
    """

    if me.id == other.id:
        # Self-DM is not supported.
        raise ValueError("Cannot create DM chat with self")

    u1, u2 = _ordered_pair(int(me.id), int(other.id))

    with transaction.atomic():
        chat, created = Chat.objects.get_or_create(
            kind=Chat.KIND_DM,
            dm_user1_id=u1,
            dm_user2_id=u2,
            defaults={"created_by": me},
        )
        if created:
            ChatMember.objects.bulk_create(
                [
                    ChatMember(chat=chat, user_id=u1, role=ChatMember.ROLE_MEMBER),
                    ChatMember(chat=chat, user_id=u2, role=ChatMember.ROLE_MEMBER),
                ]
            )
        else:
            # Ensure memberships exist (in case of legacy DB)
            ChatMember.objects.get_or_create(chat=chat, user_id=u1)
            ChatMember.objects.get_or_create(chat=chat, user_id=u2)

    return chat


def get_other_user_for_dm(chat: Chat, me: User) -> Optional[User]:
    if chat.kind != Chat.KIND_DM:
        return None
    if chat.dm_user1_id == me.id:
        return chat.dm_user2
    return chat.dm_user1


def build_threads_for_user(user: User) -> List[Dict[str, Any]]:
    """Build inbox dialogs list (DM + Group) for the given user.

    Keeps the template contract close to the previous implementation.

    Each item:
      - kind: 'dm' | 'group'
      - chat: Chat
      - other_user: User (only for dm)
      - last_message: ChatMessage | None
      - unread_count: int
    """

    memberships = (
        ChatMember.objects.filter(user=user, is_hidden=False)
        .select_related(
            "chat",
            "chat__dm_user1",
            "chat__dm_user2",
        )
        .order_by("-chat__last_message_at", "-chat__id")
    )

    last_ids = [m.chat.last_message_id for m in memberships if m.chat.last_message_id]
    last_msgs = (
        ChatMessage.objects.filter(id__in=last_ids)
        .select_related("sender")
        .only("id", "chat_id", "sender_id", "text", "created_at")
    )
    last_by_id = {m.id: m for m in last_msgs}

    threads: List[Dict[str, Any]] = []

    for m in memberships:
        chat = m.chat
        last = last_by_id.get(chat.last_message_id) if chat.last_message_id else None

        other_user = get_other_user_for_dm(chat, user)

        is_manager = False
        if chat.kind == Chat.KIND_GROUP:
            is_manager = bool(
                (m.role in (ChatMember.ROLE_OWNER, ChatMember.ROLE_ADMIN))
                or (chat.created_by_id and int(chat.created_by_id) == int(user.id))
            )

        threads.append(
            {
                "kind": chat.kind,
                "chat": chat,
                "other_user": other_user,
                "last_message": last,
                "unread_count": int(m.unread_count or 0),
                "role": m.role,
                "can_delete": (chat.kind == Chat.KIND_GROUP and is_manager),
                "can_manage": (chat.kind == Chat.KIND_GROUP and is_manager),
            }
        )

    return threads


def get_unread_total(user: User) -> int:
    agg = ChatMember.objects.filter(user=user, is_hidden=False).aggregate(total=Sum("unread_count"))
    return int(agg.get("total") or 0)


def mark_chat_read(user: User, chat: Chat, last_message_id: int | None) -> None:
    """Mark the chat as read for the user."""

    ChatMember.objects.filter(chat=chat, user=user).update(
        unread_count=0,
        last_read_message_id=last_message_id or None,
    )
