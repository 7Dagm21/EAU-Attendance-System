import sys
import requests
import urllib3

urllib3.disable_warnings()

TOKEN = "8686617227:AAHOlrg0Ohe6fkPhFwiRGYb7ui4jHFTQrPo"

def set_webhook(public_url):
    public_url = public_url.strip().rstrip('/')
    if not public_url.startswith('http'):
        public_url = f"https://{public_url}"
    
    webhook_url = f"{public_url}/api/telegram-webhook/"
    api_url = f"https://api.telegram.org/bot{TOKEN}/setWebhook"
    
    print(f"Connecting Telegram Bot to: {webhook_url}...")
    try:
        r = requests.post(api_url, json={"url": webhook_url}, verify=False, timeout=10)
        res = r.json()
        if res.get("ok"):
            print("SUCCESS: Telegram Bot Webhook has been connected successfully!")
            print(f"Webhook URL: {webhook_url}")
        else:
            print(f"FAILED: {res.get('description')}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        set_webhook(sys.argv[1])
    else:
        url = input("Enter your public tunnel HTTPS URL (e.g. https://xxxx.a.pinggy.link or https://xxxx.ngrok-free.app): ")
        set_webhook(url)
