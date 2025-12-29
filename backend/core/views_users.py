from __future__ import annotations

from typing import Tuple, List, Set

from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.db.models import Q, Case, When, Value, IntegerField
from django.http import HttpRequest, JsonResponse, HttpResponse
from django.shortcuts import render
from django.template.loader import render_to_string
from django.views.decorators.http import require_GET

from .models import User, Follow


DEFAULT_LIMIT = 20
MAX_LIMIT = 50


def _tokens(q: str) -> List[str]:
    return [t for t in (q or "").strip().split() if t]


def _users_queryset(current_user: User, q: str):
    """Base queryset for listing/searching users."""
    qs = User.objects.all()
    # UX: usually you don't need to see yourself in search results
    if current_user and getattr(current_user, "is_authenticated", False):
        qs = qs.exclude(pk=current_user.pk)

    q = (q or "").strip()
    tokens = _tokens(q)

    if tokens:
        cond = Q()
        for t in tokens:
            cond &= (Q(username__icontains=t) | Q(display_name__icontains=t))
        qs = qs.filter(cond)

    if q:
        # Simple, DB-friendly ranking (works well for thousands of users)
        qs = qs.annotate(
            search_rank=Case(
                When(username__iexact=q, then=Value(0)),
                When(display_name__iexact=q, then=Value(1)),
                When(username__istartswith=q, then=Value(2)),
                When(display_name__istartswith=q, then=Value(3)),
                When(username__icontains=q, then=Value(4)),
                When(display_name__icontains=q, then=Value(5)),
                default=Value(6),
                output_field=IntegerField(),
            )
        ).order_by("search_rank", "username")
    else:
        qs = qs.order_by("username")

    return qs


def _slice_users(
    current_user: User,
    q: str,
    offset: int,
    limit: int,
) -> Tuple[List[User], Set[int], bool]:
    qs = _users_queryset(current_user, q)

    offset = max(0, int(offset))
    limit = max(5, min(int(limit), MAX_LIMIT))

    chunk = list(qs[offset : offset + limit + 1])
    has_more = len(chunk) > limit
    users = chunk[:limit]

    following_ids: Set[int] = set()
    if users and current_user and current_user.is_authenticated:
        following_ids = set(
            Follow.objects.filter(follower=current_user, following__in=users).values_list(
                "following_id", flat=True
            )
        )

    return users, following_ids, has_more


@login_required
def users_view(request: HttpRequest) -> HttpResponse:
    q = (request.GET.get("q") or "").strip()
    users, following_ids, has_more = _slice_users(
        request.user, q=q, offset=0, limit=DEFAULT_LIMIT
    )

    return render(
        request,
        "core/users_list.html",
        {
            "q": q,
            "users": users,
            "following_ids": list(following_ids),
            "has_more": has_more,
            "next_offset": len(users),
            "limit": DEFAULT_LIMIT,
        },
    )


@require_GET
@login_required
def users_poll(request: HttpRequest) -> JsonResponse:
    q = (request.GET.get("q") or "").strip()

    try:
        offset = int(request.GET.get("offset") or "0")
    except ValueError:
        offset = 0

    try:
        limit = int(request.GET.get("limit") or str(DEFAULT_LIMIT))
    except ValueError:
        limit = DEFAULT_LIMIT

    users, following_ids, has_more = _slice_users(
        request.user, q=q, offset=offset, limit=limit
    )

    html = render_to_string(
        "core/partials/user_cards.html",
        {"users": users, "following_ids": list(following_ids)},
        request=request,
    )

    return JsonResponse(
        {
            "html": html,
            "next_offset": offset + len(users),
            "has_more": has_more,
        }
    )
