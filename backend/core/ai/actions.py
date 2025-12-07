# core/ai/actions.py

import random
from django.contrib.auth import get_user_model
from django.utils import timezone

from core.models import Post, Comment, Like
from core.ai.llm_client import llm_generate


# ===========================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ===========================

def weighted_post_by_recency():
    """
    Выбираем пост так, чтобы новые имели больший шанс.
    """
    posts = list(Post.objects.select_related("author"))
    if not posts:
        return None

    now = timezone.now()
    weights = []
    for p in posts:
        age_minutes = (now - p.created_at).total_seconds() / 60.0
        w = 1.0 / (1.0 + age_minutes)
        if w < 0.01:
            w = 0.01
        weights.append(w)

    return random.choices(posts, weights=weights, k=1)[0]


def weighted_choice_comment_with_persona_bias(user):
    """
    Выбираем комментарий для ответа с учётом:
    - свежести
    - приоритета комментариев под СВОИМИ постами
    - участия пользователя в ветке
    - игнорируем собственные комментарии (не разговариваем с собой)
    """
    qs = Comment.objects.select_related("post", "author", "parent")
    comments = list(qs)
    if not comments:
        return None

    now = timezone.now()
    weighted = []

    for c in comments:
        # не отвечаем на свои комментарии
        if c.author_id == user.id:
            continue

        # если пост уже удалён (на всякий случай) — пропускаем
        if not Post.objects.filter(id=c.post_id).exists():
            continue

        age_minutes = (now - c.created_at).total_seconds() / 60.0
        base_weight = 1.0 / (1.0 + age_minutes)

        # комментарии под своими постами — сильный приоритет
        if c.post.author_id == user.id:
            base_weight *= 4.0

        # если пользователь участвовал в ветке
        participated = False
        t = c
        while t.parent_id is not None:
            if t.author_id == user.id:
                participated = True
                break
            t = t.parent  # уже select_related

        if participated:
            base_weight *= 3.0

        if base_weight < 0.01:
            base_weight = 0.01

        weighted.append((c, base_weight))

    if not weighted:
        return None

    objects, weights = zip(*weighted)
    return random.choices(objects, weights=weights, k=1)[0]


# ===========================
# ПРОМПТЫ
# ===========================

def build_post_prompt(persona: dict) -> str:
    topics = ", ".join(persona.get("topics", [])) or "любым темам"

    return f"""
Ты — персонаж {persona['username']}.

Ты находишься в русскоязычной социальной сети Germify.
Здесь люди пишут короткие живые посты, как в телеграм-чатах или комментариях ВКонтакте.
Никто не любит длинные лекции и чрезмерную вежливость.

Твой стиль: {persona['style']}.
Темы, на которые ты чаще пишешь: {topics}.

Правила:
- Напиши КОРОТКИЙ пост: 1–2 предложения.
- Пиши естественно, как обычный человек.
- Можно добавить немного сарказма или лёгкой токсичности.
- Не используй эмодзи.
- Не используй шаблонные фразы и официальные обороты.
- Не упоминай, что ты ИИ или модель.

Сгенерируй один короткий пост для ленты Germify.
""".strip()


def build_comment_prompt(persona: dict, post: Post) -> str:
    topics = ", ".join(persona.get("topics", []))

    toxicity_hint = random.choices(
        [
            "",
            "Можешь слегка подколоть автора, но только по факту текста.",
            "Добавь немного сарказма, но не выдумывай того, чего в посте нет.",
            "Можешь быть чуть токсичным, но не переходи на личности.",
            "",
        ],
        weights=[5, 2, 3, 3, 5],
        k=1
    )[0]

    brevity_hint = random.choice([
        "Пиши очень коротко — одно-два предложения.",
        "Пиши максимально кратко.",
        "Не растягивай ответ.",
    ])

    return f"""
Ты — персонаж {persona['username']} на сайте Germify.

ОЧЕНЬ ВАЖНО:
- НЕ ПРИДУМЫВАЙ ТОГО, ЧЕГО НЕТ В ТЕКСТЕ.
- НЕ выдумывай скрытый смысл.
- НЕ интерпретируй короткие фразы как 'список', 'новость', 'совет' и т.п.

Germify — соцсеть, где посты могут быть обрывочными, бессмысленными или рандомными.
Твоя задача — реагировать строго на то, что реально написано, без фантазии.

Твой стиль: {persona['style']}.
Темы: {topics}.

Текст поста:
\"\"\"{post.text}\"\"\"

Правила:
- {brevity_hint}
- {toxicity_hint}
- Пиши естественно, без официоза.
- Не используй смайлы и эмодзи.
- Если пост пустой или странный — отвечай соответственно: сухо, нейтрально или саркастично, но только по факту.

Напиши один короткий комментарий по факту этого поста.
""".strip()


def build_reply_prompt(persona: dict, parent_comment: Comment) -> str:
    post = parent_comment.post

    # собираем историю ветки (предки, без самого parent_comment)
    thread = []
    current = parent_comment
    while current.parent_id is not None:
        thread.append(current.parent)
        current = current.parent

    if thread:
        thread_history = "\n".join(
            f"[{c.author.username}]: \"{c.text}\"" for c in reversed(thread)
        )
    else:
        thread_history = "(нет предыдущей истории)"

    topics = ", ".join(persona.get("topics", []))

    toxicity_hint = random.choices(
        [
            "",
            "Можешь слегка уколоть собеседника.",
            "Добавь немного сарказма, будто тебя уже достали.",
            "Можешь быть чуть токсичным, но без прямых оскорблений.",
            "",
        ],
        weights=[5, 3, 3, 3, 4],
        k=1
    )[0]

    brevity_hint = random.choice([
        "Ответ должен быть коротким — 1–2 предложения.",
        "Пиши максимально кратко.",
        "Не уходи в длинные объяснения.",
    ])

    return f"""
Ты — персонаж {persona['username']} в социальной сети Germify.
Твой стиль: {persona['style']}.
Твои интересы: {topics}.

Ниже — контекст. Важно понять, КОМУ и НА ЧТО ты отвечаешь.

[POST AUTHOR]: {post.author.username}
[POST TEXT]: \"{post.text}\"

[YOU]: {persona['username']}
[YOU ARE ANSWERING TO]: {parent_comment.author.username}
[COMMENT YOU ANSWER TO]: \"{parent_comment.text}\"

[THREAD HISTORY BEFORE THIS COMMENT]:
{thread_history}

Правила ответа:
- {brevity_hint}
- {toxicity_hint}
- НЕ повторяй текст комментария, на который отвечаешь.
- НЕ копируй фразы из истории ветки.
- НЕ пересказывай содержимое поста или комментариев.
- Говори как реальный пользователь, без официоза и извинений.
- Не используй эмодзи.
- Не пиши, что ты ИИ или модель.

Сформулируй один короткий естественный ответ на этот комментарий.
""".strip()


# ===========================
# ДЕЙСТВИЯ БОТА
# ===========================

def ai_create_post(persona: dict):
    """
    Создаёт новый пост от лица персоны.
    Посты редкие — вероятность этого действия низкая в движке.
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


def ai_like_post(persona: dict):
    """
    Лайк относительно нового поста.
    """
    User = get_user_model()
    try:
        user = User.objects.get(username=persona["username"])
    except User.DoesNotExist:
        return None

    post = weighted_post_by_recency()
    if post is None:
        return None

    # пост уже мог быть удалён
    if not Post.objects.filter(id=post.id).exists():
        return None

    if Like.objects.filter(user=user, post=post).exists():
        return None

    Like.objects.create(user=user, post=post)
    return f"{user.username} лайкнул пост {post.id}"


def ai_create_comment(persona: dict):
    """
    Комментарий под относительно новым постом.
    """
    User = get_user_model()
    try:
        user = User.objects.get(username=persona["username"])
    except User.DoesNotExist:
        return None

    post = weighted_post_by_recency()
    if post is None:
        return None

    # защита от удалённого поста
    if not Post.objects.filter(id=post.id).exists():
        return None

    prompt = build_comment_prompt(persona, post)
    text = llm_generate(prompt)
    if not text:
        return None

    Comment.objects.create(
        author=user,
        post=post,
        text=text.strip(),
    )
    return f"{user.username} оставил комментарий под постом {post.id}"


def ai_reply_to_comment(persona: dict):
    """
    Ответ на комментарий с учётом:
    - свежести
    - приоритета своих постов/веток
    - запрета отвечать самому себе
    - защиты от удалённых постов/комментов
    """
    User = get_user_model()
    try:
        user = User.objects.get(username=persona["username"])
    except User.DoesNotExist:
        return None

    parent_comment = weighted_choice_comment_with_persona_bias(user)
    if parent_comment is None:
        return None

    # если комментарий или пост успели удалить
    if not Comment.objects.filter(id=parent_comment.id).exists():
        return None
    if not Post.objects.filter(id=parent_comment.post_id).exists():
        return None

    # иногда "ленимся" отвечать
    if random.random() > 0.97:
        return None

    prompt = build_reply_prompt(persona, parent_comment)
    text = llm_generate(prompt)
    if not text:
        return None

    Comment.objects.create(
        author=user,
        post=parent_comment.post,
        parent=parent_comment,
        text=text.strip(),
    )
    return f"{user.username} ответил на комментарий {parent_comment.id} пользователя {parent_comment.author.username}"
