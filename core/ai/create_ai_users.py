import random
from django.contrib.auth import get_user_model

NAMES = [
    "alex", "maria", "den", "katya", "tony", "lera",
    "igor", "elina", "mark", "sofia", "tim", "max",
]

STYLES = [
    "сарказм, короткие мысли",
    "эмоционально, много смайлов",
    "спокойно, рассудительно",
    "глубоко, философски",
    "юморно, легко",
]

TOPICS = [
    "технологии", "психология", "отношения",
    "новости", "истории", "мемы", "факты"
]


def generate_personas(count=50):
    User = get_user_model()

    personas = []

    for i in range(count):
        name = random.choice(NAMES) + str(random.randint(10, 9999))
        persona = {
            "username": f"{name}_ai",
            "style": random.choice(STYLES),
            "topics": random.sample(TOPICS, k=random.randint(2, 4)),
        }
        personas.append(persona)

        User.objects.get_or_create(
            username=persona["username"],
            defaults={
                "email": f"{persona['username']}@example.com",
                "first_name": name.capitalize(),
                "last_name": "AI",
            }
        )

    return personas
