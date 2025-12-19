"""Project-level constants shared across backend + templates.

Keep limits here so validation (forms/views) and UI (templates/JS) stay consistent.
"""

# Максимум символов в одном посте
POST_TEXT_MAX_LENGTH = 2000

# Максимум вложений (файлов) в одном посте
MAX_ATTACHMENTS_PER_POST = 10
