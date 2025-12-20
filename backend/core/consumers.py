from __future__ import annotations

from typing import Any, Dict, List

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from core.models import Message


def user_group_name(user_id: int) -> str:
    return f"user_{user_id}"


class NotificationsConsumer(AsyncJsonWebsocketConsumer):
    """One WebSocket per authenticated user.

    Server pushes:
    - message_new: new message item HTML + refreshed inbox HTML + unread total
    - unread_total: unread count updates (e.g. after mark_read)

    Client can send:
    - {"type":"mark_read","ids":[1,2,3]}
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

        # Push initial unread total so the client does not need a request.
        count = await self._get_unread_total(self.user_id)
        await self.send_json({"type": "unread_total", "count": count})

    async def disconnect(self, close_code: int) -> None:
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content: Dict[str, Any], **kwargs: Any) -> None:
        msg_type = content.get("type")

        if msg_type == "mark_read":
            ids = content.get("ids") or []
            if not isinstance(ids, list):
                ids = []

            updated = await self._mark_read(self.user_id, ids)

            # Send updated unread count back (even if nothing updated — keeps UI consistent).
            count = await self._get_unread_total(self.user_id)
            await self.send_json({"type": "unread_total", "count": count, "updated": updated})
            return

        if msg_type == "get_unread":
            count = await self._get_unread_total(self.user_id)
            await self.send_json({"type": "unread_total", "count": count})
            return

        # Unknown message type: ignore.

    async def notify(self, event: Dict[str, Any]) -> None:
        """Handler for group_send events."""
        payload = event.get("payload")
        if payload is not None:
            await self.send_json(payload)

    @database_sync_to_async
    def _get_unread_total(self, user_id: int) -> int:
        return Message.objects.filter(recipient_id=user_id, is_read=False).count()

    @database_sync_to_async
    def _mark_read(self, user_id: int, ids: List[int]) -> int:
        # Mark only messages addressed to this user.
        qs = Message.objects.filter(recipient_id=user_id, is_read=False)
        if ids:
            qs = qs.filter(id__in=ids)
        return qs.update(is_read=True)
