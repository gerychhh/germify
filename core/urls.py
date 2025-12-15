from django.urls import path
from . import views
from django.conf import settings
from django.conf.urls.static import static
from .views import (
    # лента
    feed,
    create_post,
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

    # профили
    profile_view,
    user_profile,

    # подписки
    follow_user,
    unfollow_user,

    # прочее
    communities_view,

    # аккаунты
    register_view,
    login_view,
    logout_view,
)

urlpatterns = [
    path("", feed, name="feed"),

    # посты
    path("post/create/", create_post, name="create_post"),
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

    # аккаунты
    path("register/", register_view, name="register"),
    path("login/", login_view, name="login"),
    path("logout/", logout_view, name="logout"),

    path("post/<int:pk>/", views.post_detail, name="post_detail"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)