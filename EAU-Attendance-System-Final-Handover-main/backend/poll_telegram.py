import os
import django
import requests
import time

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sams.settings')
django.setup()

from attendance.models import Student
from django.db import models

TOKEN = '8686617227:AAHOlrg0Ohe6fkPhFwiRGYb7ui4jHFTQrPo'
URL = f"https://api.telegram.org/bot{TOKEN}"

def send_message(chat_id, text):
    try:
        requests.post(f"{URL}/sendMessage", data={'chat_id': chat_id, 'text': text})
    except Exception as e:
        print(f"Failed to send message: {e}")

def poll_updates():
    # 1. Delete the webhook so that getUpdates is allowed
    print("Deleting webhook...")
    requests.get(f"{URL}/deleteWebhook")
    
    print("Polling for Telegram updates...")
    offset = None
    
    # We will poll for 60 seconds just to process the pending /start commands
    start_time = time.time()
    
    while time.time() - start_time < 300:
        try:
            req_url = f"{URL}/getUpdates?timeout=5"
            if offset:
                req_url += f"&offset={offset}"
            
            resp = requests.get(req_url, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                for result in data.get('result', []):
                    offset = result['update_id'] + 1
                    message = result.get('message', {})
                    text = message.get('text', '').strip()
                    chat_id = message.get('chat', {}).get('id')
                    username = message.get('from', {}).get('username')
                    
                    if text.startswith('/start'):
                        print(f"Received /start from username: {username} (chat_id: {chat_id})")
                        if not username:
                            send_message(chat_id, "Welcome! To link your account, you must set a Telegram username in your Telegram settings, and ensure the admin has registered it.")
                            continue
                            
                        students = Student.objects.filter(
                            models.Q(parent_telegram__iexact=username) | 
                            models.Q(parent_telegram__iexact=f"@{username}")
                        )
                        
                        if students.exists():
                            students.update(parent_telegram_chat_id=str(chat_id))
                            send_message(chat_id, f"Welcome @{username}! Your account has been successfully linked. You will now receive attendance notifications here.")
                            print(f"SUCCESS: Linked @{username} to chat_id {chat_id}")
                        else:
                            send_message(chat_id, f"Welcome! We couldn't find a student record linked to your username (@{username}). Please ask the administration to register your Telegram username.")
                            print(f"FAILED: No student found for @{username}")
            
            time.sleep(1)
        except Exception as e:
            print(f"Error during polling: {e}")
            time.sleep(2)
            
    print("Polling script finished.")

if __name__ == '__main__':
    poll_updates()
