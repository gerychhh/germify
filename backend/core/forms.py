from django import forms
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm

from .models import User, Post, Message, Comment


class RegisterForm(UserCreationForm):
    class Meta:
        model = User
        # username = @userid (задаётся при регистрации и потом не меняется)
        fields = ("username", "email", "display_name", "password1", "password2")


class LoginForm(AuthenticationForm):
    username = forms.CharField(
        label="Логин",
        widget=forms.TextInput(attrs={"placeholder": "Логин"})
    )
    password = forms.CharField(
        label="Пароль",
        widget=forms.PasswordInput(attrs={"placeholder": "Пароль"})
    )


class PostForm(forms.ModelForm):
    class Meta:
        model = Post
        fields = ("text",)
        widgets = {
            "text": forms.Textarea(
                attrs={
                    "rows": 3,
                    "placeholder": "О чём вы думаете?"
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
                    "placeholder": "Напишите сообщение..."
                }
            )
        }


class ProfileForm(forms.ModelForm):
    """
    Форма редактирования профиля.
    username (@userid) здесь НЕТ — его менять нельзя.
    """
    class Meta:
        model = User
        fields = ("display_name", "bio")
        widgets = {
            "display_name": forms.TextInput(
                attrs={
                    "placeholder": "Ваше отображаемое имя",
                    "class": "profile-input",
                }
            ),
            "bio": forms.Textarea(
                attrs={
                    "rows": 3,
                    "placeholder": "Расскажите о себе",
                    "class": "profile-textarea",
                }
            ),
        }

class CommentForm(forms.ModelForm):
    class Meta:
        model = Comment
        fields = ["text"]
        widgets = {
            "text": forms.Textarea(attrs={
                "rows": 2,
                "placeholder": "Напишите комментарий...",
                "class": "comment-textarea"
            })
        }
