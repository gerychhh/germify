from __future__ import annotations

from django.contrib.auth import get_user_model

from allauth.account.adapter import DefaultAccountAdapter
from allauth.account.utils import user_username
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    def pre_social_login(self, request, sociallogin):
        if sociallogin.is_existing:
            return

        email = (sociallogin.user.email or "").strip()
        if not email:
            return

        User = get_user_model()
        user = (
            User.objects.filter(email__iexact=email)
            .order_by("id")
            .first()
        )
        if user and user.is_active:
            sociallogin.connect(request, user)


class AccountAdapter(DefaultAccountAdapter):
    def populate_username(self, request, user):
        if user_username(user):
            return user

        email = (user.email or "").strip()
        base = email.split("@")[0] if email else "user"
        user.username = self.generate_unique_username([base, email])
        return user
