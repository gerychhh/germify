from django.db import migrations, models
import core.models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0017_community_enhancements"),
    ]

    operations = [
        migrations.AddField(
            model_name="community",
            name="moderator_permissions",
            field=models.JSONField(
                blank=True,
                default=core.models.default_moderator_permissions,
                verbose_name="Права модераторов",
            ),
        ),
    ]
