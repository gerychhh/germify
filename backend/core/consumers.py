from __future__ import annotations

from typing import Any, Dict, List, Optional

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.db.models import Max, Sum

from core.models import ChatMember, ChatMessage


def user_group_name(user_id: int) -> str:
    return f"user_{user_id}"


class NotificationsConsumer(AsyncJsonWebsocketConsumer):
    """One WebSocket per authenticated user.

    Server pushes:
    - message_new: new message item HTML + refreshed inbox HTML + unread total
    - unread_total: unread count updates (e.g. after mark_read)

    Client can send:
    - {"type":"mark_read","chat_id":123,"last_id":456}
    - {"type":"mark_read","ids":[1,2,3]} (legacy)
    - {"type":"get_unread"}
    """

    async def connect(self) -> None:
        user = self.scope.get("user")
        if not user or user.is_anonymous:
            await self.close(code=4401)
            return

        self.user_id = int(user.id)
        self.group_name = user_group_name(self.user_id)

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        count = await self._get_unread_total(self.user_id)
        await self.send_json({"type": "unread_total", "count": count})

    async def disconnect(self, close_code: int) -> None:
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content: Dict[str, Any], **kwargs: Any) -> None:
        msg_type = content.get("type")

        if msg_type == "mark_read":
            chat_id = content.get("chat_id")
            last_id = content.get("last_id")
            ids = content.get("ids") or []

            updated = 0
            if isinstance(chat_id, int):
                try:
                    last_id_int = int(last_id) if last_id is not None else None
                except (TypeError, ValueError):
                    last_id_int = None
                updated = await self._mark_read_by_chat(self.user_id, chat_id, last_id_int)
            else:
                if not isinstance(ids, list):
                    ids = []
                # legacy path: mark read by message ids
                updated = await self._mark_read_by_ids(self.user_id, ids)

            count = await self._get_unread_total(self.user_id)
            await self.send_json({"type": "unread_total", "count": count, "updated": updated})
            return

        if msg_type == "get_unread":
            count = await self._get_unread_total(self.user_id)
            await self.send_json({"type": "unread_total", "count": count})
            return

    async def notify(self, event: Dict[str, Any]) -> None:
        payload = event.get("payload")
        if payload is not None:
            await self.send_json(payload)

    @database_sync_to_async
    def _get_unread_total(self, user_id: int) -> int:
        agg = ChatMember.objects.filter(user_id=user_id, is_hidden=False).aggregate(total=Sum("unread_count"))
        return int(agg.get("total") or 0)

    @database_sync_to_async
    def _mark_read_by_chat(self, user_id: int, chat_id: int, last_id: Optional[int]) -> int:
        # Mark chat read for this user.
        qs = ChatMember.objects.filter(user_id=user_id, chat_id=chat_id)
        if not qs.exists():
            return 0

        update_data: Dict[str, Any] = {"unread_count": 0}
        if last_id:
            # keep max(last_read_message_id, last_id)
            member = qs.only("id", "last_read_message_id").first()
            if member and member.last_read_message_id:
                update_data["last_read_message_id"] = max(int(member.last_read_message_id), int(last_id))
            else:
                update_data["last_read_message_id"] = int(last_id)

        return qs.update(**update_data)

    @database_sync_to_async
    def _mark_read_by_ids(self, user_id: int, ids: List[int]) -> int:
        # Legacy: infer chat ids from message ids.
        if not ids:
            return ChatMember.objects.filter(user_id=user_id).update(unread_count=0)

        try:
            ids_int = [int(x) for x in ids]
        except Exception:
            ids_int = []

        rows = (
            ChatMessage.objects.filter(id__in=ids_int)
            .values("chat_id")
            .annotate(max_id=Max("id"))
        )

        updated = 0
        for r in rows:
            chat_id = r.get("chat_id")
            max_id = r.get("max_id")
            if chat_id:
                updated += ChatMember.objects.filter(user_id=user_id, chat_id=chat_id).update(
                    unread_count=0,
                    last_read_message_id=max_id,
                )

        return updated
