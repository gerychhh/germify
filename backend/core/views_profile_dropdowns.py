from __future__ import annotations

from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.views.decorators.http import require_GET

from core.models import CommunityMembership, Follow, User


def _first_letter(value: str | None) -> str:
    s = (value or "").strip()
    return (s[:1] or "?").upper()


def _user_item(u: User) -> dict:
    title = (u.display_name or u.username or "").strip()
    return {
        "title": title or (u.username or ""),
        "subtitle": f"@{u.username}" if u.username else "",
        "url": reverse("user_profile", kwargs={"username": u.username}),
        "avatar_url": u.avatar.url if getattr(u, "avatar", None) else None,
        "fallback": _first_letter(title or u.username),
    }


def _community_item(c) -> dict:
    title = (getattr(c, "name", "") or "").strip()
    return {
        "title": title,
        "subtitle": "",
        "url": reverse("community_detail", kwargs={"slug": c.slug}),
        "avatar_url": c.icon.url if getattr(c, "icon", None) else None,
        "fallback": _first_letter(title),
    }


def _success(items, total: int | None = None):
    payload = {"success": True, "items": items}
    if total is not None:
        payload["total"] = total
    return JsonResponse(payload)


@require_GET
def profile_stats_json(request, username: str):
    profile_user = get_object_or_404(User, username=username)

    followers = Follow.objects.filter(following=profile_user).count()
    following = Follow.objects.filter(follower=profile_user).count()

    communities_admin = CommunityMembership.objects.filter(user=profile_user, is_admin=True).count()
    communities_joined = CommunityMembership.objects.filter(user=profile_user, is_admin=False).count()

    return JsonResponse(
        {
            "success": True,
            "followers": followers,
            "following": following,
            "communities_admin": communities_admin,
            "communities_joined": communities_joined,
        }
    )


@login_required
@require_GET
def profile_followers_json(request, username: str):
    profile_user = get_object_or_404(User, username=username)
    q = (request.GET.get("q") or "").strip()

    qs = (
        Follow.objects.filter(following=profile_user)
        .select_related("follower")
        .order_by("-created_at")
    )

    if q:
        qs = qs.filter(
            Q(follower__username__icontains=q) | Q(follower__display_name__icontains=q)
        )

    users = [f.follower for f in qs[:100]]
    items = [_user_item(u) for u in users]
    return _success(items, total=qs.count())


@login_required
@require_GET
def profile_following_json(request, username: str):
    profile_user = get_object_or_404(User, username=username)
    q = (request.GET.get("q") or "").strip()

    qs = (
        Follow.objects.filter(follower=profile_user)
        .select_related("following")
        .order_by("-created_at")
    )

    if q:
        qs = qs.filter(
            Q(following__username__icontains=q) | Q(following__display_name__icontains=q)
        )

    users = [f.following for f in qs[:100]]
    items = [_user_item(u) for u in users]
    return _success(items, total=qs.count())


@login_required
@require_GET
def profile_communities_admin_json(request, username: str):
    profile_user = get_object_or_404(User, username=username)
    q = (request.GET.get("q") or "").strip()

    qs = (
        CommunityMembership.objects.filter(user=profile_user, is_admin=True)
        .select_related("community")
        .order_by("-joined_at")
    )

    if q:
        qs = qs.filter(community__name__icontains=q)

    communities = [m.community for m in qs[:100]]
    items = [_community_item(c) for c in communities]
    return _success(items, total=qs.count())


@login_required
@require_GET
def profile_communities_joined_json(request, username: str):
    profile_user = get_object_or_404(User, username=username)
    q = (request.GET.get("q") or "").strip()

    qs = (
        CommunityMembership.objects.filter(user=profile_user, is_admin=False)
        .select_related("community")
        .order_by("-joined_at")
    )

    if q:
        qs = qs.filter(community__name__icontains=q)

    communities = [m.community for m in qs[:100]]
    items = [_community_item(c) for c in communities]
    return _success(items, total=qs.count())
