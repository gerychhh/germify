from django.db import migrations, models


def seed_permissions(apps, schema_editor):
    Membership = apps.get_model('core', 'CommunityMembership')
    for membership in Membership.objects.all():
        membership.permissions = {
            "manage_posts": True,
            "manage_members": True,
            "edit_appearance": False,
        }
        membership.save(update_fields=["permissions"])


def clear_permissions(apps, schema_editor):
    Membership = apps.get_model('core', 'CommunityMembership')
    Membership.objects.update(permissions={})


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0017_community_enhancements'),
    ]

    operations = [
        migrations.AddField(
            model_name='communitymembership',
            name='permissions',
            field=models.JSONField(blank=True, default=dict, verbose_name='Права модератора'),
        ),
        migrations.RunPython(seed_permissions, reverse_code=clear_permissions),
    ]
