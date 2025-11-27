from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User, Post, Message, Follow, Like


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
    list_display = ("id", "author", "short_text", "created_at")
    list_filter = ("created_at",)
    search_fields = ("text", "author__username", "author__display_name")

    def short_text(self, obj):
        return (obj.text[:50] + "…") if len(obj.text) > 50 else obj.text

    short_text.short_description = "Текст"


# Остальные модели (чтобы были видны в админке)

@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "sender", "recipient", "created_at", "is_read")
    search_fields = ("text", "sender__username", "recipient__username")


@admin.register(Follow)
class FollowAdmin(admin.ModelAdmin):
    list_display = ("id", "follower", "following", "created_at")
    search_fields = ("follower__username", "following__username")


@admin.register(Like)
class LikeAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "post", "created_at")
    search_fields = ("user__username",)
