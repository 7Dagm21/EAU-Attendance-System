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

        students = Student.objects.filter(
            Q(parent_telegram__iexact=username) |
            Q(parent_telegram__iexact=f"@{username}")
        )

        if students.exists():

            students.update(parent_telegram_chat_id=str(chat_id))

            requests.post(
                f"https://api.telegram.org/bot{TOKEN}/sendMessage",
                data={
                    "chat_id": chat_id,
                    "text": "Your account has been linked successfully."
                }
            )

        else:

            requests.post(
                f"https://api.telegram.org/bot{TOKEN}/sendMessage",
                data={
                    "chat_id": chat_id,
                    "text": "No matching student found."
                }
            )

    return JsonResponse({"ok": True})