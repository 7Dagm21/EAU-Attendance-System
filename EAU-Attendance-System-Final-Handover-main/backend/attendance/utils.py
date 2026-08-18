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
            requests.post(url, data=payload, verify=False, timeout=10)
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


def send_absence_alert(student, course, date, summary=None, status_label=None, session_type=None):
    """
    Sends a single consolidated absence alert (Email & Telegram) containing
    session date, course, absence status, and updated attendance threshold metrics.
    """
    course_name = getattr(course, 'name', str(course))
    session_str = f" ({session_type.title()})" if session_type else ""

    metric_rows_html = ""
    telegram_metric_text = ""
    status_advice = "Please ensure the student maintains the minimum required attendance (85%) and attends upcoming sessions."

    if summary:
        current_pct = summary.get('current_percentage', 0.0)
        proj_pct = summary.get('projected_final_percentage', 0.0)
        classes_held = summary.get('classes_held_hours', 0)
        rem_classes = summary.get('remaining_possible_hours', 0)

        if status_label == 'cannot_sit_final' or proj_pct < 85.0:
            status_advice = (
                f"🚨 CRITICAL: Best possible final attendance is {proj_pct}%, which is below the 85.0% threshold. "
                f"The student is at immediate risk of being debarred from final examinations."
            )
        elif status_label == 'at_risk' or current_pct < 85.0:
            status_advice = (
                f"⚠️ WARNING: Current attendance is {current_pct}%, below the required 85.0% minimum threshold. "
                f"Please ensure regular attendance in upcoming sessions to restore examination eligibility."
            )
        else:
            status_advice = (
                f"ℹ️ Status: Current attendance is {current_pct}% (Best possible: {proj_pct}%). "
                f"Please ensure the student attends subsequent sessions."
            )

        pct_color = '#e74c3c' if current_pct < 85.0 else '#27ae60'
        metric_rows_html = f"""
            <tr style="background-color: #f8fafc;">
                <td style="padding: 10px; font-weight: bold;">Current Attendance</td>
                <td style="padding: 10px; font-weight: bold; color: {pct_color};">{current_pct}%</td>
            </tr>
            <tr>
                <td style="padding: 10px;">Best Possible Final Attendance</td>
                <td style="padding: 10px;">{proj_pct}%</td>
            </tr>
            <tr style="background-color: #f8fafc;">
                <td style="padding: 10px;">Classes Held / Remaining</td>
                <td style="padding: 10px;">{classes_held} held / {rem_classes} remaining</td>
            </tr>
        """

        telegram_metric_text = (
            f"📊 *Attendance Summary:*\n"
            f"• *Current Attendance:* {current_pct}%\n"
            f"• *Best Possible Final:* {proj_pct}%\n"
            f"• *Required Minimum:* 85.0%\n\n"
        )

    subject = f"Absence Alert — {student.full_name} — {course_name}"
    student_display_name = student.full_name

    body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #1B3A6B; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px;">EAU Attendance System</h1>
            <p style="color: #cbd5e1; margin: 4px 0 0 0; font-size: 13px;">Official Absence & Attendance Notification</p>
        </div>
        <div style="padding: 24px; background-color: #ffffff;">
            <h2 style="color: #e74c3c; margin-top: 0; font-size: 18px;">⚠️ Absence Notification</h2>
            <p style="font-size: 14px; color: #334155;">Dear {student_display_name},</p>
            <p style="font-size: 14px; color: #334155;">This is an automated notification that you were marked <strong>ABSENT</strong> for the following class session:</p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
                <tr style="background-color: #1B3A6B; color: white;">
                    <td style="padding: 10px; font-weight: bold;">Course</td>
                    <td style="padding: 10px;">{course_name}{session_str}</td>
                </tr>
                <tr style="background-color: #f8fafc;">
                    <td style="padding: 10px; font-weight: bold;">Date</td>
                    <td style="padding: 10px;">{date}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; font-weight: bold;">Student ID</td>
                    <td style="padding: 10px;">{student.student_id}</td>
                </tr>
                <tr style="background-color: #fef2f2; color: #991b1b;">
                    <td style="padding: 10px; font-weight: bold;">Session Status</td>
                    <td style="padding: 10px; font-weight: bold;">ABSENT</td>
                </tr>
                {metric_rows_html}
            </table>
            
            <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px; margin: 16px 0; font-size: 13px; color: #92400e; border-radius: 0 6px 6px 0;">
                <strong>Notice & Required Action:</strong><br/>
                {status_advice}
            </div>

            <p style="color: #64748b; font-size: 11px; margin-top: 20px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
                This is an automated message from the Emirates Aviation University Attendance Management System. If you have an authorized excuse, please provide official documentation to your department.
            </p>
        </div>
    </div>
    """

    # 1. Send to student email
    if student.email:
        send_email(student.email, subject, body)

    # 2. Send to parent email
    if student.parent_email:
        parent_body = body.replace(f"Dear {student_display_name},", f"Dear Parent/Guardian of {student_display_name},")
        send_email(student.parent_email, subject, parent_body)

    # 3. Create in-app notifications
    try:
        from .models import User, Notification
        summary_txt = f" Current attendance: {summary['current_percentage']}%." if summary else ""
        student_user = User.objects.filter(email=student.email).first()
        if student_user:
            Notification.objects.create(
                recipient=student_user,
                notification_type='absence',
                message=f"You were marked absent in {course_name} on {date}.{summary_txt}"
            )
        parent_user = User.objects.filter(email=student.parent_email).first()
        if parent_user:
            Notification.objects.create(
                recipient=parent_user,
                notification_type='absence',
                message=f"Your student {student.full_name} was marked absent in {course_name} on {date}.{summary_txt}"
            )
    except Exception as e:
        print(f"Error creating in-app notification: {e}")

    # 4. Send EXACTLY ONE Telegram message to parent
    if student.parent_telegram_chat_id:
        import requests
        from decouple import config
        token = config('TELEGRAM_BOT_TOKEN', default='8686617227:AAHOlrg0Ohe6fkPhFwiRGYb7ui4jHFTQrPo')
        url = f"https://api.telegram.org/bot{token}/sendMessage"

        telegram_message = (
            f"Dear Parent/Guardian,\n\n"
            f"This is an automated attendance alert from *EAU Attendance System*.\n\n"
            f"• *Student:* {student.full_name} ({student.student_id})\n"
            f"• *Course:* {course_name}\n"
            f"• *Date:* {date}{session_str}\n"
            f"• *Status:* ❌ ABSENT\n\n"
            f"{telegram_metric_text}"
            f"📢 *Notice:*\n{status_advice}"
        )

        payload = {
            'chat_id': student.parent_telegram_chat_id,
            'text': f"⚠️ *Absence Alert — {student.full_name} — {course_name}*\n\n{telegram_message}",
            'parse_mode': 'Markdown'
        }
        try:
            requests.post(url, data=payload, verify=False, timeout=10)
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
