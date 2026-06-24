# Generated manually on 2026-06-11

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('attendance', '0007_alter_user_managed_programme_alter_user_role'),
    ]

    operations = [
        migrations.AddField(
            model_name='student',
            name='department',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='students', to='attendance.department'),
        ),
    ]
