import requests

# LM Studio local server endpoint
LLM_URL = "http://localhost:1234/v1/chat/completions"

def llm_generate(prompt: str) -> str:
    """Генерирует текст через локальную модель Qwen2.5 7B в LM Studio."""

    payload = {
        "model": "qwen2.5-7b",  # имя модели (можно посмотреть в /v1/models)
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.8,
        "max_tokens": 150
    }

    try:
        response = requests.post(
            LLM_URL,
            json=payload,
            timeout=60
        )
        data = response.json()

        # LM Studio (OpenAI формат)
        return data["choices"][0]["message"]["content"].strip()

    except Exception as e:
        print("LLM ERROR:", e)
        return ""
