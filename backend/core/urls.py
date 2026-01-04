from django.urls import path

from . import views
from .views_users import users_view, users_poll
from .urls_profile_dropdowns import urlpatterns as profile_dropdown_urls


urlpatterns = [
    path("", views.feed, name="feed"),

    path("register/", views.register_view, name="register"),
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),

    path("post/create/", views.create_post, name="create_post"),
    path("post/<int:pk>/", views.post_detail, name="post_detail"),
    path("post/<int:pk>/delete/", views.delete_post, name="delete_post"),
    path("post/<int:pk>/edit/", views.edit_post, name="edit_post"),

    path("post/<int:pk>/like/", views.toggle_like, name="toggle_like"),

    path("comment/add/<int:post_id>/", views.add_comment, name="add_comment"),
    path("reply/add/<int:comment_id>/", views.add_reply, name="add_reply"),
    path("comment/<int:comment_id>/delete/", views.delete_comment, name="delete_comment"),
    path("comment/<int:comment_id>/like/", views.toggle_comment_like, name="toggle_comment_like"),

    path("profile/", views.profile_view, name="profile"),
    path("u/<str:username>/", views.user_profile, name="user_profile"),
    path("u/<str:username>/follow/", views.follow_user, name="follow_user"),
    path("u/<str:username>/unfollow/", views.unfollow_user, name="unfollow_user"),

    path("messages/", views.messages_inbox, name="messages_inbox"),
    path("messages/poll/", views.messages_inbox_poll, name="messages_inbox_poll"),
    path("messages/unread-count/", views.messages_unread_count, name="messages_unread_count"),

    path("messages/group/create/", views.messages_group_create, name="messages_group_create"),
    path("messages/chat/<int:chat_id>/", views.messages_chat, name="messages_chat"),
    path("messages/chat/<int:chat_id>/send/", views.messages_chat_send, name="messages_chat_send"),
    path("messages/chat/<int:chat_id>/poll/", views.messages_chat_poll, name="messages_chat_poll"),
    path("messages/chat/<int:chat_id>/header/", views.messages_chat_header, name="messages_chat_header"),

    path("messages/chat/<int:chat_id>/manage/", views.messages_chat_manage, name="messages_chat_manage"),
    path("messages/chat/<int:chat_id>/rename/", views.messages_chat_rename, name="messages_chat_rename"),
    path("messages/chat/<int:chat_id>/members/add/", views.messages_chat_members_add, name="messages_chat_members_add"),
    path("messages/chat/<int:chat_id>/members/remove/<int:user_id>/", views.messages_chat_members_remove, name="messages_chat_members_remove"),
    path("messages/chat/<int:chat_id>/avatar/", views.messages_chat_avatar_update, name="messages_chat_avatar_update"),
    path("messages/chat/<int:chat_id>/delete/", views.messages_chat_delete, name="messages_chat_delete"),
    path("messages/chat/<int:chat_id>/leave/", views.messages_chat_leave, name="messages_chat_leave"),

    # legacy DM
    path("messages/<str:username>/", views.messages_thread, name="messages_thread"),
    path("messages/<str:username>/send/", views.messages_send, name="messages_send"),
    path("messages/<str:username>/poll/", views.messages_poll, name="messages_poll"),
    path("messages/<str:username>/delete/", views.messages_delete_thread, name="messages_delete_thread"),

    path("communities/", views.communities_view, name="communities"),
    path("communities/create/", views.community_create, name="community_create"),
    path("communities/<slug:slug>/", views.community_detail, name="community_detail"),
    path("communities/<slug:slug>/join/", views.community_join, name="community_join"),
    path("communities/<slug:slug>/leave/", views.community_leave, name="community_leave"),
    path("communities/<slug:slug>/edit/", views.community_edit, name="community_edit"),
    path("communities/<slug:slug>/posts/create/", views.community_create_post, name="community_create_post"),
    path("communities/<slug:slug>/members/chunk/", views.community_members_chunk, name="community_members_chunk"),
    path("communities/<slug:slug>/members/", views.community_members_api, name="community_members_api"),
    path("communities/<slug:slug>/settings/api/", views.community_settings_api, name="community_settings_api"),
    path("communities/<slug:slug>/delete/", views.community_delete, name="community_delete"),
    path("communities/<slug:slug>/members/<int:user_id>/role/", views.community_member_role, name="community_member_role"),
    path("communities/<slug:slug>/members/<int:user_id>/remove/", views.community_member_remove, name="community_member_remove"),
    path("communities/<slug:slug>/join-requests/", views.community_join_requests, name="community_join_requests"),
    path(
        "communities/<slug:slug>/join-requests/<int:request_id>/<str:action>/",
        views.community_join_request_action,
        name="community_join_request_action",
    ),
    path("communities/<slug:slug>/moderator-request/", views.community_moderator_request, name="community_moderator_request"),
    path("communities/<slug:slug>/moderator-requests/", views.community_moderator_requests, name="community_moderator_requests"),
    path(
        "communities/<slug:slug>/moderator-requests/<int:request_id>/<str:action>/",
        views.community_moderator_request_action,
        name="community_moderator_request_action",
    ),

    # Users (list + realtime search + infinite scroll)
    path("users/", users_view, name="users"),
    path("users/poll/", users_poll, name="users_poll"),
]

urlpatterns += profile_dropdown_urls
