# Generated manually on 2026-06-12

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('attendance', '0010_attendancerecord_submitted_at'),
    ]

    operations = [
        migrations.CreateModel(
            name='TeachingSchedule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('day_of_week', models.IntegerField(choices=[(0, 'Monday'), (1, 'Tuesday'), (2, 'Wednesday'), (3, 'Thursday'), (4, 'Friday'), (5, 'Saturday'), (6, 'Sunday')])),
                ('start_time', models.TimeField(blank=True, null=True)),
                ('end_time', models.TimeField(blank=True, null=True)),
                ('course_offering', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='schedule_slots', to='attendance.courseoffering')),
            ],
            options={
                'ordering': ['day_of_week', 'start_time'],
                'unique_together': {('course_offering', 'day_of_week', 'start_time')},
            },
        ),
    ]
