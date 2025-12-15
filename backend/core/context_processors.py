from .models import Message

def unread_messages_count(request):
    if not request.user.is_authenticated:
        return {"unread_messages_count": 0}

    total = Message.objects.filter(
        recipient=request.user,
        is_read=False,
    ).count()
    return {"unread_messages_count": total}
