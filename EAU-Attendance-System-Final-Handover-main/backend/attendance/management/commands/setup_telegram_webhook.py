import requests
from django.core.management.base import BaseCommand
from decouple import config

class Command(BaseCommand):
    help = 'Automatically registers Telegram Webhook from environment config'

    def handle(self, *args, **options):
        token = config('TELEGRAM_BOT_TOKEN', default='8686617227:AAHOlrg0Ohe6fkPhFwiRGYb7ui4jHFTQrPo')
        webhook_url = config('TELEGRAM_WEBHOOK_URL', default=None)

        if not webhook_url:
            self.stdout.write(self.style.WARNING("TELEGRAM_WEBHOOK_URL not set in environment. Skipping webhook auto-registration."))
            return

        # Automatically append /api/telegram-webhook/ if only domain/tunnel is provided
        if not webhook_url.endswith('/api/telegram-webhook/'):
            webhook_url = webhook_url.rstrip('/') + '/api/telegram-webhook/'

        telegram_api_url = f"https://api.telegram.org/bot{token}/setWebhook?url={webhook_url}"

        try:
            res = requests.post(telegram_api_url, verify=False, timeout=10).json()
            if res.get('ok'):
                self.stdout.write(self.style.SUCCESS(f"Successfully registered Telegram Webhook to: {webhook_url}"))
            else:
                self.stdout.write(self.style.ERROR(f"Failed to register Telegram Webhook: {res}"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error registering Telegram Webhook: {e}"))
