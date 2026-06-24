# Generated manually on 2026-06-11

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('attendance', '0008_student_department'),
    ]

    operations = [
        migrations.AddField(
            model_name='course',
            name='semester',
            field=models.IntegerField(default=1, help_text='Which semester of the year this course is taught in (1 or 2)', validators=[django.core.validators.MinValueValidator(1)]),
        ),
    ]
