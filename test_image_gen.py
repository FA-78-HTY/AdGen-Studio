from google import genai
from google.genai import types
import os
from dotenv import load_dotenv

load_dotenv()
genai_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

prompt = "A promotional poster for a cafe, containing this image."

try:
    print("Trying generate_content with gemini-3.1-flash-image-preview and image input...")
    
    # Create a dummy image
    from PIL import Image
    import io
    img = Image.new('RGB', (100, 100), color = 'red')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_bytes = img_byte_arr.getvalue()
    
    result = genai_client.models.generate_content(
        model='gemini-3.1-flash-image-preview',
        contents=[
            types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
            prompt
        ],
        config=types.GenerateContentConfig(
            response_modalities=['TEXT', 'IMAGE']
        )
    )
    print("SUCCESS generate_content.")
    if result.candidates and result.candidates[0].content.parts:
        for part in result.candidates[0].content.parts:
             print("Part returned:", type(part))
             if hasattr(part, 'inline_data'):
                 print("Has inline_data, length:", len(part.inline_data.data))
                 
except Exception as e:
    print("ERROR:", str(e))
