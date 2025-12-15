from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

# === ПЕРСОНЫ, КОТОРЫЕ МЫ ХОТИМ СОЗДАТЬ ===
PERSONAS = [
    {
        "username": "anton_ai",
        "first_name": "Anton",
        "last_name": "AI",
        "email": "anton_ai@example.com",
    },
    {
        "username": "marina_ai",
        "first_name": "Marina",
        "last_name": "AI",
        "email": "marina_ai@example.com",
    },
    {
        "username": "kira_ai",
        "first_name": "Kira",
        "last_name": "AI",
        "email": "kira_ai@example.com",
    },
    {
        "username": "max_ai",
        "first_name": "Max",
        "last_name": "AI",
        "email": "max_ai@example.com",
    },
    {
        "username": "sofia_ai",
        "first_name": "Sofia",
        "last_name": "AI",
        "email": "sofia_ai@example.com",
    },
]


class Command(BaseCommand):
    help = "Создаёт AI пользователей для ботов (если их нет)."

    def handle(self, *args, **kwargs):
        User = get_user_model()

        for p in PERSONAS:
            user, created = User.objects.get_or_create(
                username=p["username"],
                defaults={
                    "first_name": p["first_name"],
                    "last_name": p["last_name"],
                    "email": p["email"],
                }
            )

            if created:
                self.stdout.write(self.style.SUCCESS(f"Создан пользователь: {user.username}"))
            else:
                self.stdout.write(self.style.WARNING(f"Пользователь уже существует: {user.username}"))

        self.stdout.write(self.style.SUCCESS("\nГотово! Все AI пользователи созданы."))
