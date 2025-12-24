from django.contrib import admin
from django.urls import path
from core import views
from .views import (
    feed,
    create_post,
    delete_post,
    edit_post,
    toggle_like,
    add_comment,
    add_reply,
    delete_comment,
    toggle_comment_like,
    register_view,
    login_view,
    logout_view,
    user_profile,
    profile_view,
    follow_user,
    unfollow_user,
    messages_inbox,
    messages_thread,
    messages_send,
    messages_poll,
    messages_delete_thread,
    messages_unread_count,
    messages_chat,
    messages_chat_send,
    messages_chat_poll,
    messages_group_create,
    messages_chat_manage,
    messages_chat_rename,
    messages_chat_members_add,
    messages_chat_members_remove,
    messages_chat_delete,
    messages_chat_leave,
    messages_chat_header,
    messages_chat_avatar_update,
    communities_view,
    community_create,
    community_detail,
    community_join,
    community_leave,
    community_edit,
    community_create_post,
    community_members_chunk,
)

from core.urls_profile_dropdowns import urlpatterns as profile_dropdown_urls

urlpatterns = [
    path("admin/", admin.site.urls),

    path("", feed, name="feed"),
    path("posts/create/", create_post, name="create_post"),
    path("posts/<int:pk>/delete/", delete_post, name="delete_post"),
    path("posts/<int:pk>/edit/", edit_post, name="edit_post"),

    path("posts/<int:pk>/like/", toggle_like, name="toggle_like"),
    path("comments/<int:post_id>/add/", add_comment, name="add_comment"),
    path("comments/<int:comment_id>/reply/", add_reply, name="add_reply"),
    path("comments/<int:comment_id>/delete/", delete_comment, name="delete_comment"),
    path("comments/<int:comment_id>/like/", toggle_comment_like, name="toggle_comment_like"),

    path("register/", register_view, name="register"),
    path("login/", login_view, name="login"),
    path("logout/", logout_view, name="logout"),

    path("profile/", profile_view, name="profile"),
    path("u/<str:username>/", user_profile, name="user_profile"),
    path("u/<str:username>/follow/", follow_user, name="follow_user"),
    path("u/<str:username>/unfollow/", unfollow_user, name="unfollow_user"),

    path("messages/", messages_inbox, name="messages_inbox"),
    path("messages/poll/", views.messages_inbox_poll, name="messages_inbox_poll"),
    path("messages/unread-count/", messages_unread_count, name="messages_unread_count"),

    path("messages/group/create/", messages_group_create, name="messages_group_create"),
    path("messages/chat/<int:chat_id>/", messages_chat, name="messages_chat"),
    path("messages/chat/<int:chat_id>/send/", messages_chat_send, name="messages_chat_send"),
    path("messages/chat/<int:chat_id>/poll/", messages_chat_poll, name="messages_chat_poll"),

    path("messages/chat/<int:chat_id>/header/", messages_chat_header, name="messages_chat_header"),

    path("messages/chat/<int:chat_id>/manage/", messages_chat_manage, name="messages_chat_manage"),
    path("messages/chat/<int:chat_id>/rename/", messages_chat_rename, name="messages_chat_rename"),
    path("messages/chat/<int:chat_id>/members/add/", messages_chat_members_add, name="messages_chat_members_add"),
    path("messages/chat/<int:chat_id>/members/remove/<int:user_id>/", messages_chat_members_remove, name="messages_chat_members_remove"),
    path("messages/chat/<int:chat_id>/avatar/", messages_chat_avatar_update, name="messages_chat_avatar_update"),
    path("messages/chat/<int:chat_id>/delete/", messages_chat_delete, name="messages_chat_delete"),
    path("messages/chat/<int:chat_id>/leave/", messages_chat_leave, name="messages_chat_leave"),

    # legacy DM
    path("messages/<str:username>/", messages_thread, name="messages_thread"),
    path("messages/<str:username>/send/", messages_send, name="messages_send"),
    path("messages/<str:username>/poll/", messages_poll, name="messages_poll"),
    path("messages/<str:username>/delete/", messages_delete_thread, name="messages_delete_thread"),

    path("communities/", communities_view, name="communities"),
    path("communities/create/", community_create, name="community_create"),
    path("communities/<slug:slug>/", community_detail, name="community_detail"),
    path("communities/<slug:slug>/join/", community_join, name="community_join"),
    path("communities/<slug:slug>/leave/", community_leave, name="community_leave"),
    path("communities/<slug:slug>/edit/", community_edit, name="community_edit"),
    path("communities/<slug:slug>/posts/create/", community_create_post, name="community_create_post"),
    path("communities/<slug:slug>/members/chunk/", community_members_chunk, name="community_members_chunk"),

    path("post/<int:pk>/", views.post_detail, name="post_detail"),
]

urlpatterns += profile_dropdown_urls
