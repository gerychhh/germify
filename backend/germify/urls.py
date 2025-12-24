from django.contrib import admin
from django.urls import path, include


urlpatterns = [
    path("admin/", admin.site.urls),

    # Всё приложение core: лента, сообщения, профиль, логин/регистрация и т.д.
    path("", include("core.urls")),
]
