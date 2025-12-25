import pytest
from django.urls import reverse, resolve

PAGES_BY_NAME = [
    "feed",
    "login",
    "register",
    "messages_inbox",
    "communities",
    "profile",
]


@pytest.mark.parametrize("url_name", PAGES_BY_NAME)
def test_pages_routes_exist_with_report(url_name):
    path = reverse(url_name)
    match = resolve(path)

    ok = (match.url_name == url_name) and callable(match.func)
    print(f"[OK] {url_name:20s} -> {path}")

    assert ok
#проверка на то что ссылки реально куда-то ведут
#pytest -s -v