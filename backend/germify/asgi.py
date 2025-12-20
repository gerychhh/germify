"""
ASGI config for germify project.

It exposes the ASGI callable as a module-level variable named ``application``.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "germify.settings")

from django.core.asgi import get_asgi_application

# IMPORTANT: initialize Django first so settings/apps are ready
django_asgi_app = get_asgi_application()

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter

import germify.routing

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AuthMiddlewareStack(URLRouter(germify.routing.websocket_urlpatterns)),
    }
)
