import os

from django.contrib.sites.models import Site
from django.core.management.base import BaseCommand

from allauth.socialaccount.models import SocialApp


class Command(BaseCommand):
    help = "Bootstrap Google social app and site configuration from environment variables."

    def handle(self, *args, **options):
        client_id = os.getenv("GOOGLE_CLIENT_ID")
        client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
        site_domain = os.getenv("SITE_DOMAIN", "germify.ddns.net")
        site_name = os.getenv("SITE_NAME", "Germify")

        if not client_id or not client_secret:
            self.stdout.write(
                self.style.WARNING(
                    "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set; skipping social app bootstrap."
                )
            )
            return

        site, _ = Site.objects.update_or_create(
            id=1,
            defaults={"domain": site_domain, "name": site_name},
        )

        social_app, _ = SocialApp.objects.update_or_create(
            provider="google",
            defaults={
                "name": "Google",
                "client_id": client_id,
                "secret": client_secret,
            },
        )

        social_app.sites.add(site)
        self.stdout.write(self.style.SUCCESS("Google social app bootstrap complete."))