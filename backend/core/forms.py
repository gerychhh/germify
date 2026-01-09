from __future__ import annotations

# core/forms.py
from typing import Any

from django import forms
from django.contrib.auth.forms import UserCreationForm

from .constants import POST_TEXT_MAX_LENGTH
from .models import User, Post, Message, Comment, Community, Chat, ChatMessage


class BootstrapFormMixin:
    """Добавляет Bootstrap-классы виджетам (без затирания существующих классов)."""

    def _append_class(self, widget: forms.Widget, css_class: str) -> None:
        existing = (widget.attrs.get("class") or "").strip()
        parts = existing.split() if existing else []
        if css_class not in parts:
            parts.append(css_class)
        widget.attrs["class"] = " ".join(parts).strip()

    def apply_bootstrap(self) -> None:
        for name, field in self.fields.items():
            w = field.widget
            if isinstance(w, forms.CheckboxInput):
                self._append_class(w, "form-check-input")
            else:
                # TextInput, Textarea, FileInput, Select etc.
                self._append_class(w, "form-control")


class RegisterForm(BootstrapFormMixin, UserCreationForm):
    class Meta:
        model = User
        fields = ("username", "email", "display_name", "password1", "password2")

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.apply_bootstrap()


class PostForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = Post
        fields = ("text",)
        widgets = {
            "text": forms.Textarea(
                attrs={
                    "rows": 3,
                    "placeholder": "Напишите пост для сообщества...",
                    "class": "community-post-text",
                    "maxlength": POST_TEXT_MAX_LENGTH,
                }
            )
        }

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.apply_bootstrap()
        self.fields["text"].required = False

    def clean_text(self) -> str:
        text = (self.cleaned_data.get("text") or "").strip()
        if len(text) > POST_TEXT_MAX_LENGTH:
            raise forms.ValidationError(
                f"Текст поста слишком длинный (максимум {POST_TEXT_MAX_LENGTH} символов)."
            )
        return text


class PostEditForm(BootstrapFormMixin, forms.ModelForm):
    """Форма редактирования поста (текст). Вложения обрабатываются во view."""

    class Meta:
        model = Post
        fields = ("text",)
        widgets = {
            "text": forms.Textarea(
                attrs={
                    "rows": 4,
                    "placeholder": "Отредактируйте текст поста...",
                    "maxlength": POST_TEXT_MAX_LENGTH,
                }
            )
        }

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.apply_bootstrap()

    def clean_text(self) -> str:
        text = (self.cleaned_data.get("text") or "").strip()
        if len(text) > POST_TEXT_MAX_LENGTH:
            raise forms.ValidationError(
                f"Текст поста слишком длинный (максимум {POST_TEXT_MAX_LENGTH} символов)."
            )
        return text



class MessageForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = ChatMessage
        fields = ("text",)
        widgets = {
            "text": forms.Textarea(
                attrs={
                    "rows": 3,
                    "placeholder": "Напишите сообщение...",
                }
            )
        }

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.apply_bootstrap()


class GroupChatCreateForm(BootstrapFormMixin, forms.Form):
    """Минимальная форма создания группового чата.

    Чтобы не ломать уже готовый визуал, это отдельная простая страница.

    members: usernames через запятую (например: "alice, bob, charlie").
    """

    title = forms.CharField(
        label="Название",
        max_length=255,
        widget=forms.TextInput(attrs={"placeholder": "Название группы..."}),
    )
    members = forms.CharField(
        label="Участники",
        required=False,
        widget=forms.TextInput(attrs={"placeholder": "username1, username2, ..."}),
        help_text="Usernames через запятую. Себя добавлять не нужно.",
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.apply_bootstrap()


class ProfileForm(BootstrapFormMixin, forms.ModelForm):
    """Форма редактирования профиля."""

    class Meta:
        model = User
        fields = ("display_name", "bio", "avatar")
        widgets = {
            "display_name": forms.TextInput(
                attrs={
                    "placeholder": "Как тебя называть?",
                }
            ),
            "bio": forms.Textarea(
                attrs={
                    "rows": 3,
                    "placeholder": "Расскажи о себе...",
                }
            ),
            "avatar": forms.FileInput(
                attrs={
                    "class": "profile-avatar-input",
                    "accept": "image/*",
                }
            ),
        }

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.apply_bootstrap()


class CommentForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = Comment
        fields = ("text",)
        widgets = {
            "text": forms.Textarea(
                attrs={
                    "rows": 2,
                    "placeholder": "Оставьте комментарий...",
                }
            )
        }

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.apply_bootstrap()


class CommunityForm(BootstrapFormMixin, forms.ModelForm):
    tags = forms.CharField(required=False, help_text="Через запятую", widget=forms.TextInput())
    links = forms.CharField(required=False, help_text="По одному в строке", widget=forms.Textarea(attrs={"rows": 2}))

    class Meta:
        model = Community
        fields = (
            "name",
            "description",
            "icon",
            "cover",
            "accent_color",
            "tags",
            "links",
            "rules",
            "post_policy",
            "post_requires_approval",
            "comments_enabled",
            "allow_links",
        )
        widgets = {
            "name": forms.TextInput(
                attrs={
                    "placeholder": "Название сообщества",
                }
            ),
            "description": forms.Textarea(
                attrs={
                    "rows": 3,
                    "placeholder": "Короткое описание...",
                }
            ),
            "icon": forms.FileInput(
                attrs={
                    "accept": "image/*",
                }
            ),
            "cover": forms.FileInput(
                attrs={"accept": "image/*"},
            ),
            "rules": forms.Textarea(attrs={"rows": 3, "placeholder": "Правила и рекомендации"}),
            "accent_color": forms.TextInput(attrs={"placeholder": "#3366ff"}),
        }

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        # Pre-fill textual representation for JSON fields
        if self.instance and self.instance.pk:
            self.fields["tags"].initial = ", ".join(self.instance.tags or [])
            self.fields["links"].initial = "\n".join(self.instance.links or [])
        self.apply_bootstrap()

    def clean_tags(self):
        raw = (self.cleaned_data.get("tags") or "").strip()
        if not raw:
            return []
        return [t.strip() for t in raw.replace(";", ",").split(",") if t.strip()]

    def clean_links(self):
        raw = (self.cleaned_data.get("links") or "").strip()
        if not raw:
            return []
        return [ln.strip() for ln in raw.splitlines() if ln.strip()]


class CommunityPostForm(BootstrapFormMixin, forms.ModelForm):
    """Текст поста + опция "от лица сообщества"."""

    post_as_community = forms.BooleanField(
        required=False,
        label="Опубликовать от лица сообщества",
    )

    class Meta:
        model = Post
        fields = ("text",)
        widgets = {
            "text": forms.Textarea(
                attrs={
                    "rows": 3,
                    "placeholder": "Напишите пост для сообщества...",
                    "maxlength": POST_TEXT_MAX_LENGTH,
                }
            )
        }

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.apply_bootstrap()
        self.fields["text"].required = False

    def clean_text(self) -> str:
        text = (self.cleaned_data.get("text") or "").strip()
        if len(text) > POST_TEXT_MAX_LENGTH:
            raise forms.ValidationError(
                f"Текст поста слишком длинный (максимум {POST_TEXT_MAX_LENGTH} символов)."
            )
        return text
