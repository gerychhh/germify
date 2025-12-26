"""
Django settings for germify project.
"""

from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent

# ------------------------------------------------------------
# Load .env (works both for: manual run + docker)
# 1) backend/.env (if exists)
# 2) project_root/.env (your case: C:\gerychhh_\germify\germify\.env)
# ------------------------------------------------------------
try:
    from dotenv import load_dotenv
    load_dotenv(BASE_DIR / ".env")
    load_dotenv(BASE_DIR.parent / ".env")
except Exception:
    pass


SECRET_KEY = os.getenv(
    "DJANGO_SECRET_KEY",
    "django-insecure-^1!s$@qo59(9(u#pl&em7m%5^v6s0y%k*2svc^@!n*3a#l2p7p"
)

DEBUG = os.getenv("DJANGO_DEBUG", "1") == "1"

# Hosts
_hosts_env = os.getenv("DJANGO_ALLOWED_HOSTS", "").strip()
_hosts_fallback = "germify.ddns.net,www.germify.ddns.net,127.0.0.1,localhost,79.170.108.189,51.195.190.235"
ALLOWED_HOSTS = [h.strip() for h in (_hosts_env or _hosts_fallback).split(",") if h.strip()]

# CSRF
_csrf_env = os.getenv("DJANGO_CSRF_TRUSTED_ORIGINS", "").strip()
_csrf_fallback = "https://germify.ddns.net,http://germify.ddns.net,http://127.0.0.1,http://localhost"
CSRF_TRUSTED_ORIGINS = [u.strip() for u in (_csrf_env or _csrf_fallback).split(",") if u.strip()]


INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "core.apps.CoreConfig",
    "channels",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "germify.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "core.context_processors.unread_messages_count",
            ],
        },
    },
]

WSGI_APPLICATION = "germify.wsgi.application"
ASGI_APPLICATION = "germify.asgi.application"


# ------------------------------------------------------------
# Database
# IMPORTANT:
# - Outside Docker: default host should be 127.0.0.1
# - Inside Docker: docker-compose sets MYSQL_HOST=db
# ------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": os.getenv("MYSQL_DATABASE", "germify"),
        "USER": os.getenv("MYSQL_USER", "germify_user"),
        "PASSWORD": os.getenv("MYSQL_PASSWORD", "mysqlmysql@@1"),
        "HOST": os.getenv("MYSQL_HOST", "127.0.0.1"),
        "PORT": os.getenv("MYSQL_PORT", "3306"),
        "OPTIONS": {"charset": "utf8mb4"},
    }
}


AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Europe/Minsk"
USE_I18N = True
USE_TZ = True

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "core.User"

LOGIN_URL = "login"
LOGIN_REDIRECT_URL = "feed"
LOGOUT_REDIRECT_URL = "feed"

DATA_UPLOAD_MAX_MEMORY_SIZE = 25 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 25 * 1024 * 1024


# Channels (WebSocket)
REDIS_URL = os.environ.get("REDIS_URL", "").strip()

if REDIS_URL:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [REDIS_URL]},
        }
    }
else:
    CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
