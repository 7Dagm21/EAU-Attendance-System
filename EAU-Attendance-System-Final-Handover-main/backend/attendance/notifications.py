import requests
from django.core.mail import send_mail
from django.conf import settings
from decouple import config

def send_attendance_alert(attendance_record):
    """
    Delegates to the unified send_absence_alert in utils.
    """
    from .utils import send_absence_alert
    try:
        send_absence_alert(
            attendance_record.student,
            attendance_record.course_offering.course,
            attendance_record.date,
            session_type=attendance_record.session_type,
        )
    except Exception as e:
        print(f"DEBUG: send_attendance_alert error: {e}")