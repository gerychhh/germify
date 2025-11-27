from django import forms
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm

from .models import User, Post, Message


class RegisterForm(UserCreationForm):
    class Meta:
        model = User
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
