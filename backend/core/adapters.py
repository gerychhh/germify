from __future__ import annotations

from django.contrib.auth import get_user_model

from allauth.socialaccount.adapter import DefaultSocialAccountAdapter


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    def pre_social_login(self, request, sociallogin):
        if sociallogin.is_existing:
            return

        email = (sociallogin.user.email or "").strip()
        if not email:
            return

        User = get_user_model()
        matches = User.objects.filter(email__iexact=email)
        if matches.count() != 1:
            return

        user = matches.first()
        if user and user.is_active:
            sociallogin.connect(request, user)
