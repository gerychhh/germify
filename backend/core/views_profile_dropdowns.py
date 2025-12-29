from __future__ import annotations

from django.http import JsonResponse, HttpRequest
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.template.loader import render_to_string
from django.views.decorators.http import require_GET

from .models import User, Follow, CommunityMembership


def _avatar_html(request: HttpRequest, u: User, size: str = "sm") -> str:
    return render_to_string(
        "core/partials/avatar.html",
        {"user_obj": u, "size": size},
        request=request,
    )


@require_GET
def profile_followers_json(request: HttpRequest, username: str) -> JsonResponse:
    profile_user = get_object_or_404(User, username=username)
    q = (request.GET.get("q") or "").strip().lower()

    rel = Follow.objects.filter(following=profile_user).select_related("follower")
    users = [r.follower for r in rel]

    if q:
        users = [
            u for u in users
            if q in (u.username or "").lower()
            or q in (u.display_name or "").lower()
        ]

    items = []
    for u in users[:200]:
        items.append(
            {
                "title": u.display_name or u.username,
                "subtitle": f"@{u.username}",
                "url": reverse("user_profile", kwargs={"username": u.username}),
                "avatar_html": _avatar_html(request, u, "sm"),
            }
        )

    return JsonResponse({"success": True, "items": items, "total": len(users)})


@require_GET
def profile_following_json(request: HttpRequest, username: str) -> JsonResponse:
    profile_user = get_object_or_404(User, username=username)
    q = (request.GET.get("q") or "").strip().lower()

    rel = Follow.objects.filter(follower=profile_user).select_related("following")
    users = [r.following for r in rel]

    if q:
        users = [
            u for u in users
            if q in (u.username or "").lower()
            or q in (u.display_name or "").lower()
        ]

    items = []
    for u in users[:200]:
        items.append(
            {
                "title": u.display_name or u.username,
                "subtitle": f"@{u.username}",
                "url": reverse("user_profile", kwargs={"username": u.username}),
                "avatar_html": _avatar_html(request, u, "sm"),
            }
        )

    return JsonResponse({"success": True, "items": items, "total": len(users)})


@require_GET
def profile_communities_admin_json(request: HttpRequest, username: str) -> JsonResponse:
    profile_user = get_object_or_404(User, username=username)
    q = (request.GET.get("q") or "").strip().lower()

    mem_qs = (
        CommunityMembership.objects.filter(user=profile_user, is_admin=True)
        .select_related("community")
    )

    items = []
    for m in mem_qs[:200]:
        c = m.community
        if q and q not in (c.name or "").lower():
            continue

        icon_url = ""
        if getattr(c, "icon", None):
            try:
                icon_url = request.build_absolute_uri(c.icon.url)
            except Exception:
                icon_url = ""

        items.append(
            {
                "title": c.name,
                "subtitle": f"@{c.slug}",
                "url": reverse("community_detail", kwargs={"slug": c.slug}),
                "avatar_url": icon_url,
                "fallback": (c.name or "•")[:1],
            }
        )

    return JsonResponse({"success": True, "items": items, "total": mem_qs.count()})


@require_GET
def profile_communities_joined_json(request: HttpRequest, username: str) -> JsonResponse:
    profile_user = get_object_or_404(User, username=username)
    q = (request.GET.get("q") or "").strip().lower()

    mem_qs = (
        CommunityMembership.objects.filter(user=profile_user)
        .select_related("community")
    )

    items = []
    for m in mem_qs[:200]:
        c = m.community
        if q and q not in (c.name or "").lower():
            continue

        icon_url = ""
        if getattr(c, "icon", None):
            try:
                icon_url = request.build_absolute_uri(c.icon.url)
            except Exception:
                icon_url = ""

        items.append(
            {
                "title": c.name,
                "subtitle": f"@{c.slug}",
                "url": reverse("community_detail", kwargs={"slug": c.slug}),
                "avatar_url": icon_url,
                "fallback": (c.name or "•")[:1],
            }
        )

    return JsonResponse({"success": True, "items": items, "total": mem_qs.count()})
