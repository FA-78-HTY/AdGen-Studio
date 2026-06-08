from google import genai
from google.genai import types
import os
from dotenv import load_dotenv

load_dotenv()
genai_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

try:
    print("Trying generate_content with gemini-3.1-flash-image-preview...")
    result = genai_client.models.generate_content(
        model='gemini-3.1-flash-image-preview',
        contents="A promotional pamphlet for a cafe."
    )
    print("SUCCESS generate_content. Result type:", type(result))
except Exception as e:
    print("ERROR:", str(e))
