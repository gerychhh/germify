from django.shortcuts import render

def index(request):
    message = None

    if request.method == "POST":
        message = "Кнопка нажата! Вот логика backend 🎉"

    return render(request, "core/index.html", {"message": message})
