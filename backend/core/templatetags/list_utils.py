from django import template

register = template.Library()

@register.filter(name="in_list")
def in_list(value, container):
    """Return True if value is present in container.

    Django templates don't support Python's `in` in `{% with %}` expressions.
    This filter makes membership checks readable.

    Usage:
        {% load list_utils %}
        {% with is_following=u.id|in_list:following_ids %}
            ...
        {% endwith %}
    """
    try:
        return value in (container or [])
    except TypeError:
        return False
