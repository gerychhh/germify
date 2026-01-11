from django.contrib import admin
from django.urls import path, include

from core import views as core_views


urlpatterns = [
    path("admin/", admin.site.urls),
    path("accounts/social/signup/", core_views.socialaccount_auto_signup, name="socialaccount_signup"),
    path("accounts/", include("allauth.urls")),
    # Всё приложение core: лента, сообщения, профиль, логин/регистрация и т.д.
    path("", include("core.urls")),
]
