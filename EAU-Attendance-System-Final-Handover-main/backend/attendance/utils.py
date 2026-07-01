from decimal import Decimal

from django.core.mail import send_mail
from decouple import config


def send_email(to_email, subject, body):
    try:
        send_mail(
            subject=subject,
            message='',
            from_email=config('DEFAULT_FROM_EMAIL'),
            recipient_list=[to_email],
            html_message=body,
            fail_silently=False,
        )
        return True
    except Exception as e:
        print(f"Email error: {e}")
        return None


def calculate_attendance_status(student, offering, cutoff_date=None):
    from datetime import date

    from django.db.models import Max, Sum

    from .models import AttendanceRecord

    cutoff_date = cutoff_date or date.today()

    session_rows = (
        AttendanceRecord.objects.filter(
            course_offering=offering,
            date__lte=cutoff_date,
        )
        .values('date', 'session_type')
        .annotate(session_hours=Max('hours_attended'))
    )
    classes_held_hours = sum(
        Decimal(str(row['session_hours'] or 0)) for row in session_rows
    )
    if classes_held_hours <= 0:
        return None

    records = AttendanceRecord.objects.filter(
        student=student,
        course_offering=offering,
        date__lte=cutoff_date,
    )

    present_hours = records.filter(status='present').aggregate(
        total=Sum('hours_attended')
    )['total'] or Decimal('0')
    late_hours = records.filter(status='late').aggregate(
        total=Sum('hours_attended')
    )['total'] or Decimal('0')
    late_sessions = records.filter(status='late').values('date', 'session_type').distinct().count()
    excused_hours = records.filter(status='excused').aggregate(
        total=Sum('hours_attended')
    )['total'] or Decimal('0')

    effective_given_hours = max(classes_held_hours - excused_hours, Decimal('1'))
    earned_hours = present_hours + max(late_hours - (Decimal('0.5') * Decimal(str(late_sessions))), Decimal('0'))

    total_course_hours = Decimal(str(offering.course.total_credit_hours))
    effective_total_hours = max(total_course_hours - excused_hours, Decimal('1'))
    remaining_possible_hours = max(effective_total_hours - effective_given_hours, Decimal('0'))
    projected_final_hours = min(earned_hours + remaining_possible_hours, effective_total_hours)

    current_pct = round(float((earned_hours / effective_given_hours) * 100), 1)
    projected_final_pct = round(float((projected_final_hours / effective_total_hours) * 100), 1)

    return {
        'classes_held_hours': float(classes_held_hours),
        'effective_given_hours': float(effective_given_hours),
        'earned_hours': float(earned_hours),
        'current_percentage': current_pct,
        'projected_final_percentage': projected_final_pct,
        'remaining_possible_hours': float(remaining_possible_hours),
        'total_course_hours': float(total_course_hours),
        'can_reach_threshold': projected_final_pct >= 85.0,
    }


def send_attendance_status_warning(student, course, summary, status_label):
    if status_label == 'cannot_sit_final':
        subject = f"Final Exam Eligibility Warning — {course.name}"
        title = "Final Exam Eligibility Notice"
        action_text = (
            f"Based on the attendance recorded so far, the best possible final attendance is "
            f"{summary['projected_final_percentage']}%, which is below the 85% requirement. "
            f"This means you cannot sit for the final examination."
        )
    else:
        subject = f"Attendance Warning — {course.name}"
        title = "Attendance Threshold Warning"
        action_text = (
            f"Your current attendance is {summary['current_percentage']}% based on the "
            f"classes held so far. Please improve attendance immediately to remain eligible."
        )

    body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #1B3A6B; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">EAU Attendance System</h1>
        </div>
        <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #f39c12;">{title}</h2>
            <p>Dear {student.full_name},</p>
            <p><strong>{course.name}</strong></p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr style="background-color: #1B3A6B; color: white;">
                    <td style="padding: 10px;">Current Attendance</td>
                    <td style="padding: 10px;">{summary['current_percentage']}%</td>
                </tr>
                <tr style="background-color: #f2f2f2;">
                    <td style="padding: 10px;">Best Possible Final Attendance</td>
                    <td style="padding: 10px;">{summary['projected_final_percentage']}%</td>
                </tr>
                <tr>
                    <td style="padding: 10px;">Classes Held</td>
                    <td style="padding: 10px;">{summary['classes_held_hours']}</td>
                </tr>
                <tr style="background-color: #f2f2f2;">
                    <td style="padding: 10px;">Remaining Possible Classes</td>
                    <td style="padding: 10px;">{summary['remaining_possible_hours']}</td>
                </tr>
            </table>
            <p>{action_text}</p>
            <p style="color: #666; font-size: 12px;">
                This is an automated message from the EAU Attendance Management System.
            </p>
        </div>
    </div>
    """

    send_email(student.email, subject, body)

    try:
        from .models import Notification, User

        student_user = User.objects.filter(email=student.email).first()
        if student_user:
            Notification.objects.create(
                recipient=student_user,
                notification_type='threshold',
                message=(
                    f"{title}: {student.full_name} in {course.name} has current attendance "
                    f"{summary['current_percentage']}% and projected final attendance "
                    f"{summary['projected_final_percentage']}%."
                ),
            )
    except Exception as e:
        print(f"Error creating in-app notification: {e}")

    parent_body = body.replace(
        f"Dear {student.full_name}",
        f"Dear Parent/Guardian of {student.full_name}"
    )
    send_email(student.parent_email, subject, parent_body)

    try:
        from .models import Notification, User

        parent_user = User.objects.filter(email=student.parent_email).first()
        if parent_user:
            Notification.objects.create(
                recipient=parent_user,
                notification_type='threshold',
                message=(
                    f"{title}: {student.full_name} in {course.name} has current attendance "
                    f"{summary['current_percentage']}% and projected final attendance "
                    f"{summary['projected_final_percentage']}%."
                ),
            )
    except Exception as e:
        print(f"Error creating in-app parent notification: {e}")

    if student.parent_telegram_chat_id:
        import requests

        token = config('TELEGRAM_BOT_TOKEN', default='8686617227:AAHOlrg0Ohe6fkPhFwiRGYb7ui4jHFTQrPo')
        url = f"https://api.telegram.org/bot{token}/sendMessage"

        telegram_message = (
            f"Dear Parent/Guardian,\n\n"
            f"{title} for {student.full_name} ({student.student_id})\n\n"
            f"Course: {course.name}\n"
            f"Current Attendance: {summary['current_percentage']}%\n"
            f"Best Possible Final Attendance: {summary['projected_final_percentage']}%\n\n"
            f"{action_text}"
        )

        payload = {
            'chat_id': student.parent_telegram_chat_id,
            'text': f"⚠️ *{subject}*\n\n{telegram_message}",
            'parse_mode': 'Markdown'
        }
        try:
            requests.post(url, data=payload)
        except Exception as e:
            print(f"DEBUG: Telegram connection failed: {e}")


def send_threshold_warning(student, course, attended_sessions, total_sessions):
    """Backward-compatible wrapper used by older report paths."""
    summary = {
        'current_percentage': round(
            (float(attended_sessions) / float(total_sessions)) * 100, 1
        ) if total_sessions else 0.0,
        'projected_final_percentage': round(
            (float(attended_sessions) / float(total_sessions)) * 100, 1
        ) if total_sessions else 0.0,
        'classes_held_hours': float(total_sessions),
        'remaining_possible_hours': 0.0,
    }
    send_attendance_status_warning(student, course, summary, 'at_risk')


def send_absence_alert(student, course, date):
    subject = f"Absence Alert — {course.name}"

    body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #1B3A6B; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">EAU Attendance System</h1>
        </div>
        <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #e74c3c;">Absence Notification</h2>
            <p>Dear {student.full_name},</p>
            <p>This is to inform you that you were marked <strong>absent</strong> 
            from the following class:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr style="background-color: #1B3A6B; color: white;">
                    <td style="padding: 10px;">Course</td>
                    <td style="padding: 10px;">{course.name}</td>
                </tr>
                <tr style="background-color: #f2f2f2;">
                    <td style="padding: 10px;">Date</td>
                    <td style="padding: 10px;">{date}</td>
                </tr>
                <tr>
                    <td style="padding: 10px;">Student ID</td>
                    <td style="padding: 10px;">{student.student_id}</td>
                </tr>
            </table>
            <p>Please ensure you maintain the minimum required attendance to remain 
            eligible for the final examination.</p>
            <p style="color: #666; font-size: 12px;">
                This is an automated message from the EAU Attendance Management System.
            </p>
        </div>
    </div>
    """

    # Send to student
    send_email(student.email, subject, body)

    try:
        from .models import User, Notification
        student_user = User.objects.filter(email=student.email).first()
        if student_user:
            Notification.objects.create(
                recipient=student_user,
                notification_type='absence',
                message=f"You were marked absent in {course.name} on {date}."
            )
    except Exception as e:
        print(f"Error creating in-app notification: {e}")

    # Send to parent
    parent_subject = f"Absence Alert — {student.full_name} — {course.name}"
    parent_body = body.replace(
        f"Dear {student.full_name}",
        f"Dear Parent/Guardian of {student.full_name}"
    )
    send_email(student.parent_email, parent_subject, parent_body)

    try:
        from .models import User, Notification
        parent_user = User.objects.filter(email=student.parent_email).first()
        if parent_user:
            Notification.objects.create(
                recipient=parent_user,
                notification_type='absence',
                message=f"Your student {student.full_name} was marked absent in {course.name} on {date}."
            )
    except Exception as e:
        print(f"Error creating in-app parent notification: {e}")

    # Send telegram to parent
    if student.parent_telegram_chat_id:
        import requests
        from decouple import config
        token = config('TELEGRAM_BOT_TOKEN', default='8686617227:AAHOlrg0Ohe6fkPhFwiRGYb7ui4jHFTQrPo')
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        
        telegram_message = (
            f"Dear Parent/Guardian,\n\n"
            f"This is an automated absence alert from EAU Attendance System.\n\n"
            f"Student: {student.full_name} ({student.student_id})\n"
            f"Course: {course.name}\n"
            f"Date: {date}\n\n"
            f"Please ensure the student maintains the minimum required attendance."
        )
        
        payload = {
            'chat_id': student.parent_telegram_chat_id,
            'text': f"⚠️ *{parent_subject}*\n\n{telegram_message}",
            'parse_mode': 'Markdown'
        }
        try:
            requests.post(url, data=payload)
        except Exception as e:
            print(f"DEBUG: Telegram connection failed: {e}")


def send_threshold_warning(student, course, attended_sessions, total_sessions):
    """Backward-compatible wrapper used by older report paths."""
    summary = {
        'current_percentage': round(
            (float(attended_sessions) / float(total_sessions)) * 100, 1
        ) if total_sessions else 0.0,
        'projected_final_percentage': round(
            (float(attended_sessions) / float(total_sessions)) * 100, 1
        ) if total_sessions else 0.0,
        'classes_held_hours': float(total_sessions),
        'remaining_possible_hours': 0.0,
    }
    send_attendance_status_warning(student, course, summary, 'at_risk')

def send_account_created_email(user, plain_password, portal_url=None):
    """Send a welcome email containing login credentials for a newly
    created staff account (teacher, dept head, dean, or admin)."""
    portal_url = portal_url or config('FRONTEND_URL', default='http://localhost:5173')
    role_labels = {
        'admin': 'Admin',
        'dean': 'Dean',
        'dept_head': 'Department Head',
        'teacher': 'Teacher',
        'student': 'Student',
    }
    role_label = role_labels.get(user.role, user.role.title())
    login_id = user.staff_id or user.email

    subject = "Your EAU Attendance System Account"
    body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #1B3A6B; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">EAU Attendance System</h1>
        </div>
        <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #1B3A6B;">Welcome, {user.first_name or user.username}!</h2>
            <p>An account has been created for you on the EAU Attendance
            Management System with the role of <strong>{role_label}</strong>.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr style="background-color: #1B3A6B; color: white;">
                    <td style="padding: 10px;">Login ID</td>
                    <td style="padding: 10px;">{login_id}</td>
                </tr>
                <tr style="background-color: #f2f2f2;">
                    <td style="padding: 10px;">Password</td>
                    <td style="padding: 10px;">{plain_password}</td>
                </tr>
                <tr>
                    <td style="padding: 10px;">Portal Link</td>
                    <td style="padding: 10px;">
                        <a href="{portal_url}">{portal_url}</a>
                    </td>
                </tr>
            </table>
            <p>For security, please change your password after your first
            login.</p>
            <p style="color: #666; font-size: 12px;">
                This is an automated message from the EAU Attendance Management System.
            </p>
        </div>
    </div>
    """
    send_email(user.email, subject, body)
