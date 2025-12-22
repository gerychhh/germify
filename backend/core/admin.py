from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import (
    User,
    Post,
    Message,
    Follow,
    Like,
    Community,
    CommunityMembership,
    Chat,
    ChatMember,
    ChatMessage,
)


# ========= Пользователь =========

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    fieldsets = BaseUserAdmin.fieldsets + (
        ("Дополнительно", {"fields": ("display_name", "avatar", "bio")}),
    )

    list_display = ("username", "display_name", "email", "is_staff", "is_superuser")
    search_fields = ("username", "display_name", "email")


# ========= Посты =========

@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ("id", "author", "community", "as_community", "short_text", "created_at")
    list_filter = ("created_at", "as_community", "community")
    search_fields = ("text", "author__username", "author__display_name", "community__name", "community__slug")

    def short_text(self, obj):
        return (obj.text[:50] + "…") if len(obj.text) > 50 else obj.text

    short_text.short_description = "Текст"


# ========= Legacy DM messages (kept for backward compatibility) =========

@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "sender", "recipient", "created_at", "is_read")
    search_fields = ("text", "sender__username", "recipient__username")


# ========= Chats =========

@admin.register(Chat)
class ChatAdmin(admin.ModelAdmin):
    list_display = ("id", "kind", "title", "dm_user1", "dm_user2", "last_message_at")
    list_filter = ("kind",)
    search_fields = ("title", "dm_user1__username", "dm_user2__username")


@admin.register(ChatMember)
class ChatMemberAdmin(admin.ModelAdmin):
    list_display = ("id", "chat", "user", "role", "unread_count", "is_hidden", "joined_at")
    list_filter = ("role", "is_hidden")
    search_fields = ("chat__title", "user__username", "user__display_name")


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ("id", "chat", "sender", "created_at")
    search_fields = ("text", "sender__username", "sender__display_name", "chat__title")
    list_filter = ("created_at",)


# ========= Other models =========

@admin.register(Follow)
class FollowAdmin(admin.ModelAdmin):
    list_display = ("id", "follower", "following", "created_at")
    search_fields = ("follower__username", "following__username")


@admin.register(Like)
class LikeAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "post", "created_at")
    search_fields = ("user__username",)


@admin.register(Community)
class CommunityAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "slug", "created_by", "created_at")
    search_fields = ("name", "slug", "description")


@admin.register(CommunityMembership)
class CommunityMembershipAdmin(admin.ModelAdmin):
    list_display = ("id", "community", "user", "is_admin", "joined_at")
    list_filter = ("is_admin", "community")
    search_fields = ("community__name", "user__username", "user__display_name")
