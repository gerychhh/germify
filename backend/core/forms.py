# core/forms.py
from django import forms
from django.contrib.auth.forms import UserCreationForm

from .models import User, Post, Message, Comment, Community


class RegisterForm(UserCreationForm):
    class Meta:
        model = User
        fields = ("username", "email", "display_name", "password1", "password2")


class PostForm(forms.ModelForm):
    class Meta:
        model = Post
        fields = ("text",)
        widgets = {
            "text": forms.Textarea(
                attrs={
                    "rows": 3,
                    "placeholder": "Напишите что-нибудь интересное...",
                }
            )
        }


class MessageForm(forms.ModelForm):
    class Meta:
        model = Message
        fields = ("text",)
        widgets = {
            "text": forms.Textarea(
                attrs={
                    "rows": 3,
                    "placeholder": "Напишите сообщение...",
                }
            )
        }


class ProfileForm(forms.ModelForm):
    """
    Форма редактирования профиля:
    - display_name
    - bio
    - avatar (обычный FileInput, без 'Currently / Clear / Change')
    """

    class Meta:
        model = User
        fields = ("display_name", "bio", "avatar")
        widgets = {
            "display_name": forms.TextInput(
                attrs={
                    "class": "profile-input",
                    "placeholder": "Как тебя называть?",
                }
            ),
            "bio": forms.Textarea(
                attrs={
                    "class": "profile-textarea",
                    "rows": 3,
                    "placeholder": "Расскажи о себе...",
                }
            ),
            "avatar": forms.FileInput(          # важно: FileInput, не ClearableFileInput
                attrs={
                    "class": "profile-avatar-input",
                    "accept": "image/*",
                }
            ),
        }


class CommentForm(forms.ModelForm):
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


class CommunityForm(forms.ModelForm):
    class Meta:
        model = Community
        fields = ("name", "description", "icon")
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
        }


class CommunityPostForm(forms.ModelForm):
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
                }
            )
        }
