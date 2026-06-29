# 


from attendance.models import Student, AttendanceRecord, CourseOffering
from django.utils import timezone
from decimal import Decimal

student = Student.objects.get(first_name__iexact="Abel")
offering = CourseOffering.objects.first()

for i in range(10):
    AttendanceRecord.objects.create(
        student=student,
        course_offering=offering,
        attendance_date=timezone.now().date(),
        status="absent",
        hours_attended=Decimal("0")
    )