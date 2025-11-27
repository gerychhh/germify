from django.urls import path

from .views import (
    # лента / посты
    feed,
    create_post,
    delete_post,

    # сообщения
    messages_inbox,
    messages_thread,

    # профили
    profile_view,       # мой профиль (текущий пользователь)
    user_profile,       # профиль по username

    # прочее
    communities_view,

    # аккаунты
    register_view,
    login_view,
    logout_view,
)

urlpatterns = [
    # главная лента
    path("", feed, name="feed"),

    # посты
    path("post/create/", create_post, name="create_post"),
    path("post/<int:pk>/delete/", delete_post, name="delete_post"),

    # личные сообщения
    # /messages/ — список диалогов
    path("messages/", messages_inbox, name="messages"),
    path("messages/", messages_inbox, name="messages_inbox"),  # просто второй alias
    # /messages/<username>/ — конкретный диалог
    path("messages/<str:username>/", messages_thread, name="messages_thread"),

    # сообщества (если нужно)
    path("communities/", communities_view, name="communities"),

    # профили
    path("profile/", profile_view, name="profile"),                  # свой профиль
    path("u/<str:username>/", user_profile, name="user_profile"),    # чужой профиль / sharable-ссылка

    # аккаунты
    path("register/", register_view, name="register"),
    path("login/", login_view, name="login"),
    path("logout/", logout_view, name="logout"),
]
