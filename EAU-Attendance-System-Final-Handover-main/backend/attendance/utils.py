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

    # Send to parent
    parent_subject = f"Absence Alert — {student.full_name} — {course.name}"
    parent_body = body.replace(
        f"Dear {student.full_name}",
        f"Dear Parent/Guardian of {student.full_name}"
    )
    send_email(student.parent_email, parent_subject, parent_body)


def send_threshold_warning(student, course, attended_hours, minimum_hours):
    subject = f"Attendance Warning — {course.name}"
    percentage = round(
        (float(attended_hours) / float(course.total_credit_hours)) * 100, 1
    )

    body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #1B3A6B; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">EAU Attendance System</h1>
        </div>
        <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #f39c12;">Attendance Threshold Warning</h2>
            <p>Dear {student.full_name},</p>
            <p>Your attendance in <strong>{course.name}</strong> is approaching 
            the minimum required threshold.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr style="background-color: #1B3A6B; color: white;">
                    <td style="padding: 10px;">Course</td>
                    <td style="padding: 10px;">{course.name}</td>
                </tr>
                <tr style="background-color: #f2f2f2;">
                    <td style="padding: 10px;">Hours Attended</td>
                    <td style="padding: 10px;">{attended_hours} hours</td>
                </tr>
                <tr>
                    <td style="padding: 10px;">Minimum Required</td>
                    <td style="padding: 10px;">{minimum_hours} hours</td>
                </tr>
                <tr style="background-color: #f2f2f2;">
                    <td style="padding: 10px;">Current Attendance</td>
                    <td style="padding: 10px; color: #e74c3c;">
                        <strong>{percentage}%</strong>
                    </td>
                </tr>
            </table>
            <div style="background-color: #fff3cd; padding: 15px;
                        border-left: 4px solid #f39c12; margin: 20px 0;">
                <p style="margin: 0;">
                    <strong>Action Required:</strong> Please attend all upcoming 
                    classes to maintain eligibility for the final examination.
                </p>
            </div>
            <p style="color: #666; font-size: 12px;">
                This is an automated message from the EAU Attendance Management System.
            </p>
        </div>
    </div>
    """

    send_email(student.email, subject, body)
    send_email(student.parent_email, subject, body.replace(
        f"Dear {student.full_name}",
        f"Dear Parent/Guardian of {student.full_name}"
    ))

    # Send telegram to parent
    if student.parent_telegram_chat_id:
        import requests
        from decouple import config
        token = config('TELEGRAM_BOT_TOKEN', default='8686617227:AAHOlrg0Ohe6fkPhFwiRGYb7ui4jHFTQrPo')
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        
        telegram_message = (
            f"Dear Parent/Guardian,\n\n"
            f"This is an automated warning from EAU Attendance System.\n\n"
            f"Student: {student.full_name} ({student.student_id})\n"
            f"Course: {course.name}\n"
            f"Current Attendance: {percentage}%\n"
            f"Minimum Required: {minimum_hours} hours\n\n"
            f"Please ensure the student attends all upcoming classes to maintain eligibility."
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
