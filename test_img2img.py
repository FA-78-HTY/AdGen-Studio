import os
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)

# 1. Create a dummy image
from PIL import Image
import io
img = Image.new('RGB', (100, 100), color = 'red')
img_byte_arr = io.BytesIO()
img.save(img_byte_arr, format='PNG')
img_bytes = img_byte_arr.getvalue()

try:
    print("Testing gemini-3.1-flash-image-preview with Image-to-Image...")
    result = client.models.generate_content(
        model='gemini-3.1-flash-image-preview',
        contents=[
            types.Part.from_bytes(data=img_bytes, mime_type='image/png'),
            "Place this red square in a beautiful forest background."
        ],
        config=types.GenerateContentConfig(
            response_modalities=['IMAGE']
        )
    )
    if result.candidates and result.candidates[0].content.parts:
        img_data = result.candidates[0].content.parts[0].inline_data.data
        with open('test_output.png', 'wb') as f:
            f.write(img_data)
        print("Success! Generated image saved to test_output.png.")
    else:
        print("No image generated.")
except Exception as e:
    print(f"Error: {e}")
