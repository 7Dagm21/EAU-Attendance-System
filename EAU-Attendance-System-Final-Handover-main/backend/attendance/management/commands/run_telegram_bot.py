import time
import requests
from decouple import config
from django.core.management.base import BaseCommand
from django.db.models import Q
from attendance.models import Student

class Command(BaseCommand):
    help = "Run Telegram bot in polling mode (ideal for local/LAN deployment on private IPs without tunnels)"

    def handle(self, *args, **options):
        token = config('TELEGRAM_BOT_TOKEN', default='8686617227:AAHOlrg0Ohe6fkPhFwiRGYb7ui4jHFTQrPo')
        self.stdout.write(self.style.SUCCESS("Starting Telegram bot in polling mode..."))

        # Remove any existing webhook so polling can receive updates
        try:
            requests.get(f"https://api.telegram.org/bot{token}/deleteWebhook", verify=False, timeout=10)
            self.stdout.write("Cleared webhook to enable direct polling.")
        except Exception as e:
            self.stdout.write(f"Notice: {e}")

        offset = 0
        while True:
            try:
                url = f"https://api.telegram.org/bot{token}/getUpdates?offset={offset}&timeout=20"
                res = requests.get(url, verify=False, timeout=25)
                data = res.json()

                if data.get("ok"):
                    for update in data.get("result", []):
                        offset = update["update_id"] + 1
                        message = update.get("message")
                        if not message:
                            continue

                        chat_id = message.get("chat", {}).get("id")
                        text = (message.get("text") or "").strip()
                        username = message.get("from", {}).get("username")

                        if text.startswith("/start"):
                            if not username:
                                self.send_message(token, chat_id, "Welcome! Please set a Telegram username in your Telegram profile settings so we can link your account.")
                                continue

                            students = Student.objects.filter(
                                Q(parent_telegram__iexact=username) |
                                Q(parent_telegram__iexact=f"@{username}")
                            )

                            if students.exists():
                                students.update(parent_telegram_chat_id=str(chat_id))
                                self.send_message(token, chat_id, f"Welcome @{username}! Your account has been successfully linked. You will now receive attendance alerts here.")
                                self.stdout.write(self.style.SUCCESS(f"Linked @{username} to Chat ID: {chat_id}"))
                            else:
                                self.send_message(token, chat_id, f"Welcome! We couldn't find a student registered under username @{username}. Please inform the school administration.")

            except Exception as e:
                time.sleep(2)

    def send_message(self, token, chat_id, text):
        try:
            requests.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                data={"chat_id": chat_id, "text": text},
                verify=False,
                timeout=10,
            )
        except Exception as e:
            print(f"Error sending telegram response: {e}")
