from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0018_communitymembership_permissions"),
    ]

    operations = [
        migrations.CreateModel(
            name="CommunityModeratorRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "status",
                    models.CharField(
                        choices=[("pending", "В ожидании"), ("approved", "Принята"), ("denied", "Отклонена")],
                        default="pending",
                        max_length=12,
                    ),
                ),
                (
                    "community",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="moderator_requests",
                        to="core.community",
                        verbose_name="Сообщество",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="community_moderator_requests",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Пользователь",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "unique_together": {("community", "user")},
            },
        ),
    ]

