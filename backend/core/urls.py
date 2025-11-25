from django.urls import path
from . import views

urlpatterns = [
    path("", views.index),
    path("index.html", views.index),
    path("about", views.about),
    path("about.html", views.about),
]
