from django.urls import path
from . import views
from django.conf import settings
from django.conf.urls.static import static
from .views import (
    # лента
    feed,
    create_post,
    edit_post,
    delete_post,
    toggle_like,

    # комментарии
    add_comment,
    add_reply,
    toggle_comment_like,
    delete_comment,

    # сообщения
    messages_inbox,
    messages_inbox_poll,
    messages_thread,
    messages_send,
    messages_poll,
    messages_unread_count,
    messages_delete_thread,
    messages_chat,
    messages_chat_send,
    messages_chat_poll,
    messages_chat_leave,
    messages_chat_delete,
    messages_group_create,
    messages_chat_manage,
    messages_chat_header,
    messages_chat_rename,
    messages_chat_members_add,
    messages_chat_members_remove,
    messages_chat_avatar_update,

    # профили
    profile_view,
    user_profile,

    # подписки
    follow_user,
    unfollow_user,

    # прочее
    communities_view,
    community_create,
    community_detail,
    community_members_chunk,
    community_join,
    community_leave,
    community_edit,
    community_create_post,

    # аккаунты
    register_view,
    login_view,
    logout_view,
)

urlpatterns = [
    path("", feed, name="feed"),

    # посты
    path("post/create/", create_post, name="create_post"),
    path("post/<int:pk>/edit/", edit_post, name="edit_post"),
    path("post/<int:pk>/delete/", delete_post, name="delete_post"),
    path("post/<int:pk>/like-toggle/", toggle_like, name="toggle_like"),

    # комментарии
    path("post/<int:post_id>/comment/", add_comment, name="add_comment"),
    path(
        "comment/<int:comment_id>/reply/",
        add_reply,
        name="add_reply",
    ),
    path(
        "comment/<int:comment_id>/like-toggle/",
        toggle_comment_like,
        name="toggle_comment_like",
    ),
    path(
        "comment/<int:comment_id>/delete/",
        delete_comment,
        name="delete_comment",
    ),

    # сообщения
    path("messages/unread-count/", messages_unread_count, name="messages_unread_count"),
    path("messages/", messages_inbox, name="messages_inbox"),
    path("messages/poll-inbox/", messages_inbox_poll, name="messages_inbox_poll"),
    path("messages/new-group/", messages_group_create, name="messages_group_create"),
    path("messages/chat/<int:chat_id>/header/", messages_chat_header, name="messages_chat_header"),
    path("messages/chat/<int:chat_id>/manage/", messages_chat_manage, name="messages_chat_manage"),
    path("messages/chat/<int:chat_id>/rename/", messages_chat_rename, name="messages_chat_rename"),
    path("messages/chat/<int:chat_id>/members/add/", messages_chat_members_add, name="messages_chat_members_add"),
    path("messages/chat/<int:chat_id>/members/remove/<int:user_id>/", messages_chat_members_remove, name="messages_chat_members_remove"),
    path("messages/chat/<int:chat_id>/avatar/", messages_chat_avatar_update, name="messages_chat_avatar_update"),
    path("messages/chat/<int:chat_id>/", messages_chat, name="messages_chat"),
    path("messages/chat/<int:chat_id>/send/", messages_chat_send, name="messages_chat_send"),
    path("messages/chat/<int:chat_id>/poll/", messages_chat_poll, name="messages_chat_poll"),
    path("messages/chat/<int:chat_id>/leave/", messages_chat_leave, name="messages_chat_leave"),
    path("messages/chat/<int:chat_id>/delete/", messages_chat_delete, name="messages_chat_delete"),
    path("messages/<str:username>/", messages_thread, name="messages_thread"),
    path("messages/<str:username>/send/", messages_send, name="messages_send"),
    path("messages/<str:username>/delete-thread/", messages_delete_thread, name="messages_delete_thread"),
    path("messages/<str:username>/poll/", messages_poll, name="messages_poll"),

    # профили
    path("profile/", profile_view, name="profile"),
    path("u/<str:username>/", user_profile, name="user_profile"),

    # подписки
    path("u/<str:username>/follow/", follow_user, name="follow_user"),
    path("u/<str:username>/unfollow/", unfollow_user, name="unfollow_user"),

    # прочее
    path("communities/", communities_view, name="communities"),
    path("communities/create/", community_create, name="community_create"),
    path("communities/<str:slug>/", community_detail, name="community_detail"),
    path("communities/<str:slug>/members-chunk/", community_members_chunk, name="community_members_chunk"),
    path("communities/<str:slug>/join/", community_join, name="community_join"),
    path("communities/<str:slug>/leave/", community_leave, name="community_leave"),
    path("communities/<str:slug>/edit/", community_edit, name="community_edit"),
    path("communities/<str:slug>/post/", community_create_post, name="community_create_post"),

    # аккаунты
    path("register/", register_view, name="register"),
    path("login/", login_view, name="login"),
    path("logout/", logout_view, name="logout"),

    path("post/<int:pk>/", views.post_detail, name="post_detail"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)