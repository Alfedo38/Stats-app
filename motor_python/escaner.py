import os
from google import genai
from dotenv import load_dotenv

load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

print("🕵️‍♂️ Escaneando IDs técnicos de modelos en tu cuenta de Google...")
for m in client.models.list():
    if 'gemini-3' in m.name:
        print(f"👉 Nombre exacto para la API: {m.name}")