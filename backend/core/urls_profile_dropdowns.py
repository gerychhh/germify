from django.urls import path
from core import views_profile_dropdowns as v

urlpatterns = [
    path("u/<str:username>/stats.json", v.profile_stats_json, name="profile_stats_json"),
    path("u/<str:username>/followers.json", v.profile_followers_json, name="profile_followers_json"),
    path("u/<str:username>/following.json", v.profile_following_json, name="profile_following_json"),
    path("u/<str:username>/communities-admin.json", v.profile_communities_admin_json, name="profile_communities_admin_json"),
    path("u/<str:username>/communities-joined.json", v.profile_communities_joined_json, name="profile_communities_joined_json"),
]
