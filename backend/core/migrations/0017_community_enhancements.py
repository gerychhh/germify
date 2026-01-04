from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0016_alter_chatmember_options_alter_chatmessage_options_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="community",
            name="accent_color",
            field=models.CharField(blank=True, default="", max_length=9, verbose_name="Акцентный цвет"),
        ),
        migrations.AddField(
            model_name="community",
            name="allow_links",
            field=models.BooleanField(default=True, verbose_name="Разрешить ссылки"),
        ),
        migrations.AddField(
            model_name="community",
            name="archived",
            field=models.BooleanField(default=False, verbose_name="Архивировано"),
        ),
        migrations.AddField(
            model_name="community",
            name="cover",
            field=models.ImageField(blank=True, null=True, upload_to="community_covers/", verbose_name="Обложка"),
        ),
        migrations.AddField(
            model_name="community",
            name="join_policy",
            field=models.CharField(
                choices=[("open", "Свободный вход"), ("request", "По запросу"), ("invite", "По приглашению")],
                default="open",
                max_length=16,
                verbose_name="Политика вступления",
            ),
        ),
        migrations.AddField(
            model_name="community",
            name="links",
            field=models.JSONField(blank=True, default=list, verbose_name="Ссылки"),
        ),
        migrations.AddField(
            model_name="community",
            name="post_policy",
            field=models.CharField(
                choices=[("anyone", "Любой пользователь"), ("members", "Только участники"), ("staff", "Только модераторы/админы")],
                default="members",
                max_length=16,
                verbose_name="Кто может публиковать",
            ),
        ),
        migrations.AddField(
            model_name="community",
            name="post_requires_approval",
            field=models.BooleanField(default=False, verbose_name="Нужна модерация постов"),
        ),
        migrations.AddField(
            model_name="community",
            name="rules",
            field=models.TextField(blank=True, verbose_name="Правила"),
        ),
        migrations.AddField(
            model_name="community",
            name="tags",
            field=models.JSONField(blank=True, default=list, verbose_name="Темы"),
        ),
        migrations.AddField(
            model_name="community",
            name="visibility",
            field=models.CharField(
                choices=[("public", "Публичное"), ("private", "Приватное"), ("hidden", "Скрытое")],
                default="public",
                max_length=16,
                verbose_name="Видимость",
            ),
        ),
        migrations.AddField(
            model_name="community",
            name="comments_enabled",
            field=models.BooleanField(default=True, verbose_name="Комментарии включены"),
        ),
        migrations.AddField(
            model_name="communitymembership",
            name="role",
            field=models.CharField(
                choices=[("owner", "Владелец"), ("admin", "Администратор"), ("moderator", "Модератор"), ("member", "Участник"), ("guest", "Гость")],
                default="member",
                max_length=16,
                verbose_name="Роль",
            ),
        ),
        migrations.CreateModel(
            name="CommunityJoinRequest",
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
                        related_name="join_requests",
                        to="core.community",
                        verbose_name="Сообщество",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="community_join_requests",
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
        migrations.RunPython(
            code=lambda apps, schema_editor: _bootstrap_roles(apps),
            reverse_code=migrations.RunPython.noop,
        ),
    ]


def _bootstrap_roles(apps):
    Membership = apps.get_model("core", "CommunityMembership")
    Community = apps.get_model("core", "Community")

    for membership in Membership.objects.all():
        if membership.is_admin:
            # Promote creator to owner if possible
            if membership.community.created_by_id == membership.user_id:
                membership.role = "owner"
            else:
                membership.role = "admin"
        else:
            membership.role = "member"
        membership.save(update_fields=["role", "is_admin"])
