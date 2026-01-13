# core/models.py
from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
import mimetypes
from django.utils.text import slugify


class Community(models.Model):
    """Минимальная модель сообщества."""

    name = models.CharField("Название", max_length=80, unique=True)
    slug = models.SlugField("Ссылка", max_length=90, unique=True, blank=True, allow_unicode=True)
    description = models.TextField("Описание", blank=True)
    icon = models.ImageField("Иконка", upload_to="community_icons/", blank=True, null=True)
    cover = models.ImageField("Обложка", upload_to="community_covers/", blank=True, null=True)
    accent_color = models.CharField("Акцентный цвет", max_length=9, blank=True, default="")
    tags = models.JSONField("Темы", default=list, blank=True)
    links = models.JSONField("Ссылки", default=list, blank=True)
    rules = models.TextField("Правила", blank=True)
    visibility = models.CharField(
        "Видимость",
        max_length=16,
        choices=(
            ("public", "Публичное"),
            ("private", "Приватное"),
            ("hidden", "Скрытое"),
        ),
        default="public",
    )
    join_policy = models.CharField(
        "Политика вступления",
        max_length=16,
        choices=(
            ("open", "Свободный вход"),
            ("request", "По запросу"),
            ("invite", "По приглашению"),
        ),
        default="open",
    )
    post_policy = models.CharField(
        "Кто может публиковать",
        max_length=16,
        choices=(
            ("anyone", "Любой пользователь"),
            ("members", "Только участники"),
            ("staff", "Только модераторы/админы"),
        ),
        default="members",
    )
    post_requires_approval = models.BooleanField("Нужна модерация постов", default=False)
    comments_enabled = models.BooleanField("Комментарии включены", default=True)
    allow_links = models.BooleanField("Разрешить ссылки", default=True)
    archived = models.BooleanField("Архивировано", default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_communities",
        verbose_name="Создатель",
    )
    created_at = models.DateTimeField("Создано", auto_now_add=True)
    updated_at = models.DateTimeField("Обновлено", auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    # --- Адаптер под существующий avatar.html (ожидает user_obj.avatar/display_name/username) ---
    @property
    def avatar(self):
        return self.icon

    @property
    def display_name(self):
        return self.name

    @property
    def username(self):
        return self.slug

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name, allow_unicode=True) or "community"
            slug = base
            i = 2
            while Community.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base}-{i}"
                i += 1
            self.slug = slug
        super().save(*args, **kwargs)

    @property
    def members_count(self):
        return self.memberships.count()

    @property
    def posts_count(self):
        return self.posts.count()

    def is_member(self, user):
        if not user or not user.is_authenticated:
            return False
        return self.memberships.filter(user=user).exists()

    def is_admin(self, user):
        if not user or not user.is_authenticated:
            return False
        return self.memberships.filter(user=user, is_admin=True).exists()

    # --- Permissions helpers ---
    def can_view(self, user):
        if self.visibility == "public":
            return True
        if not user or not user.is_authenticated:
            return False
        return self.memberships.filter(user=user).exists()

    def can_post(self, user):
        if not user or not user.is_authenticated:
            return False

        membership = self.memberships.filter(user=user).first()
        role = getattr(membership, "role", "guest") if membership else "guest"

        # Owners and admins всегда могут публиковать.
        if role in {"owner", "admin"}:
            return True

        if self.post_policy != "anyone" and not membership:
            return False

        if role == "moderator":
            perms = membership.moderator_permissions if membership else {}
            if not perms.get("manage_posts", False):
                return False

        if self.post_policy == "anyone":
            return True
        if self.post_policy == "members":
            return role in {"member", "moderator"}
        return role == "moderator"


class CommunityMembership(models.Model):
    community = models.ForeignKey(
        Community,
        on_delete=models.CASCADE,
        related_name="memberships",
        verbose_name="Сообщество",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="community_memberships",
        verbose_name="Пользователь",
    )
    ROLE_CHOICES = (
        ("owner", "Владелец"),
        ("admin", "Администратор"),
        ("moderator", "Модератор"),
        ("member", "Участник"),
        ("guest", "Гость"),
    )

    role = models.CharField("Роль", max_length=16, choices=ROLE_CHOICES, default="member")
    permissions = models.JSONField("Права модератора", default=dict, blank=True)
    is_admin = models.BooleanField("Администратор", default=False)
    joined_at = models.DateTimeField("Вступил", auto_now_add=True)

    class Meta:
        unique_together = ("community", "user")
        ordering = ["-joined_at"]

    def __str__(self):
        role = self.role or ("admin" if self.is_admin else "member")
        return f"{self.user} in {self.community} ({role})"

    @staticmethod
    def default_permissions():
        return {
            "manage_posts": True,
            "manage_members": True,
            "edit_appearance": False,
        }

    @property
    def moderator_permissions(self):
        base = self.default_permissions()
        if self.role == "owner":
            return {key: True for key in base}
        incoming = self.permissions or {}
        for key in base:
            if key in incoming:
                base[key] = bool(incoming[key])
        return base

    def save(self, *args, **kwargs):
        if self.role in {"owner", "admin", "moderator"}:
            self.is_admin = True
        elif self.role == "guest":
            self.is_admin = False
        if self.role == "owner":
            self.permissions = {key: True for key in self.default_permissions()}
        elif not self.permissions:
            self.permissions = self.default_permissions()
        else:
            normalized = self.default_permissions()
            normalized.update({k: bool(v) for k, v in (self.permissions or {}).items() if k in normalized})
            self.permissions = normalized
        super().save(*args, **kwargs)

    @property
    def role_label(self):
        mapping = dict(self.ROLE_CHOICES)
        return mapping.get(self.role, "Участник")

    def can_moderate(self):
        return self.role in {"owner", "admin", "moderator"}


class CommunityJoinRequest(models.Model):
    community = models.ForeignKey(
        Community,
        on_delete=models.CASCADE,
        related_name="join_requests",
        verbose_name="Сообщество",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="community_join_requests",
        verbose_name="Пользователь",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(
        max_length=12,
        choices=(
            ("pending", "В ожидании"),
            ("approved", "Принята"),
            ("denied", "Отклонена"),
        ),
        default="pending",
    )

    class Meta:
        unique_together = ("community", "user")
        ordering = ["-created_at"]

    def __str__(self):
        return f"JoinRequest({self.user} -> {self.community}, {self.status})"


class CommunityModeratorRequest(models.Model):
    community = models.ForeignKey(
        Community,
        on_delete=models.CASCADE,
        related_name="moderator_requests",
        verbose_name="Сообщество",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="community_moderator_requests",
        verbose_name="Пользователь",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(
        max_length=12,
        choices=(
            ("pending", "В ожидании"),
            ("approved", "Принята"),
            ("denied", "Отклонена"),
        ),
        default="pending",
    )

    class Meta:
        unique_together = ("community", "user")
        ordering = ["-created_at"]

    def __str__(self):
        return f"ModRequest({self.user} -> {self.community}, {self.status})"


class User(AbstractUser):
    # @userid — это username (унаследован от AbstractUser) — НЕ МЕНЯЕМ
    display_name = models.CharField("Отображаемое имя", max_length=150, blank=True)
    avatar = models.ImageField("Аватар", upload_to="avatars/", blank=True, null=True)
    bio = models.TextField("О себе", blank=True)

    def __str__(self):
        return self.display_name or self.username

    @property
    def followers_count(self):
        return self.followers.count()

    @property
    def following_count(self):
        return self.following.count()


class Follow(models.Model):
    follower = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="following",
        on_delete=models.CASCADE,
    )
    following = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="followers",
        on_delete=models.CASCADE,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("follower", "following")

    def __str__(self):
        return f"{self.follower} → {self.following}"


class Post(models.Model):
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="posts",
        verbose_name="Автор",
    )
    text = models.TextField("Текст")
    created_at = models.DateTimeField("Создано", auto_now_add=True)

    # Если заполнено — пост относится к сообществу.
    community = models.ForeignKey(
        Community,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="posts",
        verbose_name="Сообщество",
    )
    # Если True — отображать как "от лица сообщества".
    as_community = models.BooleanField("Опубликовать от лица сообщества", default=False)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.author}: {self.text[:30]}"

    @property
    def is_community_post(self):
        return bool(self.community_id and self.as_community)


class Like(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="likes",
        verbose_name="Пользователь",
    )
    post = models.ForeignKey(
        Post,
        on_delete=models.CASCADE,
        related_name="likes",
        verbose_name="Пост",
    )
    created_at = models.DateTimeField("Лайк поставлен", auto_now_add=True)

    class Meta:
        unique_together = ("user", "post")

    def __str__(self):
        return f"Like({self.user} -> {self.post_id})"


class Comment(models.Model):
    post = models.ForeignKey(
        Post,
        on_delete=models.CASCADE,
        related_name="comments",
        verbose_name="Пост",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="comments",
        verbose_name="Автор",
    )
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="replies",
        verbose_name="Родительский комментарий",
    )
    text = models.TextField("Текст комментария")
    created_at = models.DateTimeField("Создано", auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Комментарий от {self.author} к посту {self.post_id}"


class CommentLike(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="comment_likes",
        verbose_name="Пользователь",
    )
    comment = models.ForeignKey(
        Comment,
        on_delete=models.CASCADE,
        related_name="likes",
        verbose_name="Комментарий",
    )
    created_at = models.DateTimeField("Лайк на комментарий", auto_now_add=True)

    class Meta:
        unique_together = ("user", "comment")

    def __str__(self):
        return f"CommentLike({self.user} -> {self.comment_id})"


class Message(models.Model):
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="Отправитель",
        related_name="sent_messages",
        on_delete=models.CASCADE,
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="Получатель",
        related_name="received_messages",
        on_delete=models.CASCADE,
    )
    text = models.TextField("Сообщение")
    created_at = models.DateTimeField("Отправлено", auto_now_add=True)
    is_read = models.BooleanField("Прочитано", default=False)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.sender} → {self.recipient}: {self.text[:30]}"


# ============================
# Chats (DM + Groups)
# ============================

class Chat(models.Model):
    KIND_DM = "dm"
    KIND_GROUP = "group"
    KIND_CHOICES = [(KIND_DM, "DM"), (KIND_GROUP, "Group")]

    # В БД поле kind создавалось max_length=16 и с default='dm'
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default=KIND_DM)

    # For groups (в миграции было max_length=120)
    title = models.CharField(max_length=120, blank=True)
    avatar = models.ImageField(upload_to="chat_avatars/", blank=True, null=True)

    # For DM: store ordered pair for uniqueness
    dm_user1 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="dm_chats_as_user1",
        on_delete=models.SET_NULL,
    )
    dm_user2 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="dm_chats_as_user2",
        on_delete=models.SET_NULL,
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="created_chats",
        on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    # Важно: поле есть в БД (created by migration), но в модели отсутствовало — из-за этого падал INSERT.
    updated_at = models.DateTimeField(auto_now=True)

    # Denormalization for fast inbox sorting
    last_message_at = models.DateTimeField(null=True, blank=True)
    last_message_id = models.BigIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["-last_message_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["dm_user1", "dm_user2"], name="uniq_dm_pair"),
        ]

    def __str__(self) -> str:
        if self.kind == self.KIND_GROUP:
            return f"GroupChat({self.id}): {self.title}"
        return f"DM({self.id}): {self.dm_user1_id}-{self.dm_user2_id}"

    # --- Adapter under existing avatar.html (expects user_obj.avatar/display_name/username) ---
    @property
    def display_name(self) -> str:
        if self.kind == self.KIND_GROUP:
            return self.title or "Группа"
        # For DM: display_name is resolved in views (other user)
        return "Чат"

    @property
    def username(self) -> str:
        # Used only for search haystack; not an actual username.
        return f"chat-{self.id}"


class ChatMember(models.Model):
    ROLE_OWNER = "owner"
    ROLE_ADMIN = "admin"
    ROLE_MEMBER = "member"
    ROLE_CHOICES = [(ROLE_OWNER, "Owner"), (ROLE_ADMIN, "Admin"), (ROLE_MEMBER, "Member")]

    chat = models.ForeignKey(Chat, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_memberships")

    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default=ROLE_MEMBER)
    joined_at = models.DateTimeField(auto_now_add=True)

    # Fast unread counters
    unread_count = models.PositiveIntegerField(default=0)
    last_read_message_id = models.BigIntegerField(null=True, blank=True)

    # Hide chat from inbox without destroying history (optional)
    is_hidden = models.BooleanField(default=False)

    class Meta:
        unique_together = ("chat", "user")

    def __str__(self) -> str:
        return f"ChatMember(chat={self.chat_id}, user={self.user_id}, role={self.role})"


class ChatMessage(models.Model):
    chat = models.ForeignKey(Chat, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_messages")
    text = models.TextField("Сообщение")
    created_at = models.DateTimeField("Отправлено", auto_now_add=True)

    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"ChatMessage({self.chat_id}) {self.sender_id}: {self.text[:30]}"


class ChatMessageAttachment(models.Model):
    """Вложения к сообщениям в чатах.

    Делаем максимально похожим на PostAttachment, чтобы UI и медиа-плееры
    работали одинаково в постах и сообщениях.
    """

    message = models.ForeignKey(
        ChatMessage,
        related_name="attachments",
        on_delete=models.CASCADE,
        verbose_name="Сообщение",
    )
    file = models.FileField(
        upload_to="attachments/",
        verbose_name="Файл",
    )
    original_name = models.CharField(
        "Оригинальное имя файла",
        max_length=255,
        blank=True,
    )

    def __str__(self):
        return self.original_name or self.file.name

    @property
    def is_image(self):
        type_, _ = mimetypes.guess_type(self.file.name)
        return bool(type_ and type_.startswith("image/"))

    def delete(self, *args, **kwargs):
        storage = self.file.storage
        name = self.file.name
        super().delete(*args, **kwargs)
        if name:
            storage.delete(name)


class PostAttachment(models.Model):
    post = models.ForeignKey(
        Post,
        related_name="attachments",
        on_delete=models.CASCADE,
        verbose_name="Пост",
    )
    file = models.FileField(
        upload_to="attachments/",
        verbose_name="Файл",
    )
    original_name = models.CharField(
        "Оригинальное имя файла",
        max_length=255,
        blank=True,
    )

    def __str__(self):
        return self.original_name or self.file.name

    @property
    def is_image(self):
        """
        Удобнее как @property, чтобы в шаблоне писать {{ att.is_image }}
        без скобок.
        """
        type_, _ = mimetypes.guess_type(self.file.name)
        return bool(type_ and type_.startswith("image/"))

    def delete(self, *args, **kwargs):
        """
        При удалении записи удаляем и файл с диска.
        Работает и при каскадном удалении поста.
        """
        storage = self.file.storage
        name = self.file.name
        super().delete(*args, **kwargs)
        if name:
            storage.delete(name)


# Дополнительно, на случай если где-то используется bulk delete или ещё что-то
@receiver(post_delete, sender=PostAttachment)
def delete_attachment_file(sender, instance, **kwargs):
    """
    Подчистить файл, если по какой-то причине метод delete() не сработал.
    (Например, при нестандартных операциях.)
    """
    if instance.file:
        instance.file.delete(False)


@receiver(post_delete, sender=ChatMessageAttachment)
def delete_chat_attachment_file(sender, instance, **kwargs):
    """Подчистить файл вложения чата при удалении записи."""
    if instance.file:
        instance.file.delete(False)
