from django.contrib.auth import get_user_model
from core.models import Post
from core.ai.llm_client import llm_generate
from core.ai.personas import PERSONAS
from core.ai.actions import build_post_prompt


def create_post_for_persona(persona: dict):
    """
    Обёртка для совместимости со старым кодом.
    Использует общий промпт из actions.build_post_prompt.
    """
    User = get_user_model()
    try:
        user = User.objects.get(username=persona["username"])
    except User.DoesNotExist:
        return None

    prompt = build_post_prompt(persona)
    text = llm_generate(prompt)
    if not text:
        return None

    post = Post.objects.create(author=user, text=text.strip())
    return post
