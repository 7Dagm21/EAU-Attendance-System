import json
import requests
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from attendance.models import Student
from django.db.models import Q

TOKEN = "8686617227:AAHOlrg0Ohe6fkPhFwiRGYb7ui4jHFTQrPo"

@csrf_exempt
def telegram_webhook(request):
    if request.method != "POST":
        return JsonResponse({"ok": False})

    data = json.loads(request.body)

    message = data.get("message", {})

    text = message.get("text", "")
    chat_id = message.get("chat", {}).get("id")
    username = message.get("from", {}).get("username")

    if text.startswith("/start"):
        clean_u = (username or "").lstrip("@").strip()
        students = Student.objects.filter(
            Q(parent_telegram__iexact=clean_u) |
            Q(parent_telegram__iexact=f"@{clean_u}")
        )

        if students.exists():
            students.update(parent_telegram_chat_id=str(chat_id))
            requests.post(
                f"https://api.telegram.org/bot{TOKEN}/sendMessage",
                data={
                    "chat_id": chat_id,
                    "text": f"Welcome @{clean_u}! Your account has been successfully linked. You will now receive attendance notifications here."
                }
            )
        else:
            requests.post(
                f"https://api.telegram.org/bot{TOKEN}/sendMessage",
                data={
                    "chat_id": chat_id,
                    "text": f"Welcome! We couldn't find a student record linked to your username (@{clean_u}). Please ask the administration to register your Telegram username."
                }
            )

    return JsonResponse({"ok": True})