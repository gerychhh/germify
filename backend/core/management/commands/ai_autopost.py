# core/management/commands/ai_autopost.py

import random
import time

from django.core.management.base import BaseCommand

from core.ai.personas import PERSONAS
from core.ai.actions import (
    ai_create_post,
    ai_like_post,
    ai_create_comment,
    ai_reply_to_comment,
)


MIN_INTERVAL = 0   # минимум 30 секунд между действиями
MAX_INTERVAL = 0  # максимум 120 секунд


class Command(BaseCommand):
    help = "AI-активность: редкие посты, лайки, комменты и ответы с контекстом."

    def handle(self, *args, **kwargs):
        self.stdout.write(self.style.SUCCESS("AI activity engine started..."))

        while True:
            persona = random.choice(PERSONAS)

            # Посты почти не создаём, основная активность — лайки/комменты/ответы
            action = random.choices(
                ["post", "like", "comment", "reply"],
                weights=[0.1, 0.37, 0.30, 0.30],
                k=1
            )[0]

            if action == "post":
                post = ai_create_post(persona)
                info = f"{persona['username']} создал пост {post.id}" if post else \
                       f"{persona['username']} попытался создать пост, но не вышло"

            elif action == "like":
                info = ai_like_post(persona) or f"{persona['username']} не нашёл, что лайкнуть"

            elif action == "comment":
                info = ai_create_comment(persona) or f"{persona['username']} не смог оставить комментарий"

            else:  # reply
                info = ai_reply_to_comment(persona) or \
                       f"{persona['username']} не нашёл комментарий для ответа"

            self.stdout.write(self.style.SUCCESS(f"• {info}"))

            delay = random.randint(MIN_INTERVAL, MAX_INTERVAL)
            self.stdout.write(f"Следующее действие через {delay} секунд...\n")

            time.sleep(delay)
