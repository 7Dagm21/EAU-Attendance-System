# Generated manually on 2026-06-11

import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('attendance', '0009_course_semester'),
    ]

    operations = [
        migrations.AddField(
            model_name='attendancerecord',
            name='submitted_at',
            field=models.DateTimeField(auto_now_add=True, default=django.utils.timezone.now, help_text='When this attendance record was submitted to the system.'),
            preserve_default=False,
        ),
    ]
