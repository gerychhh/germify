from django.urls import path
from . import views
from .views import (
    # лента
    feed,
    create_post,
    delete_post,

    # лайки
    toggle_like,

    # сообщения
    messages_inbox,
    messages_thread,

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

    # лайки
    path("post/<int:post_id>/like/", toggle_like, name="toggle_like"),

    # сообщения
    path("messages/", messages_inbox, name="messages_inbox"),
    path("messages/<str:username>/", messages_thread, name="messages_thread"),

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
]
