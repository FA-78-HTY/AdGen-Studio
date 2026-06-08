import os
from dotenv import load_dotenv
load_dotenv()
import random
from typing import List, Optional, Annotated
import datetime

from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, Security, Request, Header
from fastapi.security import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, Response
import io
import numpy as np
from naturalizer import apply_realistic_filter, build_single_prompt

# NaturalizerPipeline: naturalizer 모듈의 함수를 기존 코드 호환성을 위해 래핑
class NaturalizerPipeline:
    @staticmethod
    def preprocess_prompt(base_prompt: str) -> str:
        """사용자 프롬프트를 Positive + Negative 지시어가 결합된 단일 프롬프트로 변환."""
        return build_single_prompt(base_prompt)

    @staticmethod
    def postprocess_image(image_bytes: bytes) -> bytes:
        """생성된 이미지에 물리적 후처리 필터를 적용."""
        return apply_realistic_filter(
            image_bytes,
            downscale_ratio=0.85,
            grain_opacity=0.12,
            contrast_reduction=0.07,
        )

try:
    from rembg import remove
except BaseException as e:
    print(f"Warning: rembg module could not be imported properly: {e}")
    remove = None
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from google import genai
from google.genai import types

# ---------------------------------------------------------
# 0. 글자 제거 강제 프롬프트 (핵심 - 어떤 경우에도 반드시 삽입)
# ---------------------------------------------------------
NO_TEXT_INSTRUCTION = """
ABSOLUTE CRITICAL REQUIREMENT - THIS OVERRIDES EVERYTHING ELSE:
- Do NOT include ANY text, letters, numbers, words, sentences, characters, 
  alphabet, Korean characters (한글), Chinese characters, Japanese characters,
  logos with text, captions, watermarks, price tags, labels, signage, 
  banners with text, or ANY form of written language ANYWHERE in the image.
- The entire image must be 100% completely text-free and typography-free.
- If you planned to add any text element, replace it with a beautiful 
  decorative visual element (flowers, geometric shapes, light effects, etc.) instead.
- ZERO TEXT. NO EXCEPTIONS.
"""

# ---------------------------------------------------------
# 1. FastAPI 앱 설정
# ---------------------------------------------------------
app = FastAPI(title="광고 제작 시스템 API")

# B2B 고객사용 API 키 검증 설정
api_key_header = APIKeyHeader(name="X-Pamphlet-API-Key", auto_error=False)

VALID_CLIENTS = {
    "test_key_123": "테스트 클라이언트",
    "key_danggeun_12345": "당근마켓",
    "key_baemin_67890": "배달의민족"
}

def get_client_name(api_key: str = Security(api_key_header)) -> Optional[str]:
    return VALID_CLIENTS.get(api_key) if api_key else None

# --- Rate Limiter Setup ---
def get_client_key(request: Request):
    return request.headers.get("X-Gemini-API-Key", request.headers.get("X-Pamphlet-API-Key", "unknown"))

limiter = Limiter(key_func=get_client_key)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# --- Billing DB Setup ---
billing_db = {}
def log_billing(client_name: str, action: str = "generate"):
    if client_name not in billing_db:
        billing_db[client_name] = {"count": 0, "last_used": None}
    billing_db[client_name]["count"] += 1
    billing_db[client_name]["last_used"] = datetime.datetime.now().isoformat()

# --- Static Files Setup ---
os.makedirs(os.path.join("static", "pamphlets"), exist_ok=True)
os.makedirs(os.path.join("static", "backgrounds"), exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------
# 2. 유틸리티: 사용자 API 키로 Gemini 클라이언트 생성
# ---------------------------------------------------------
def get_gemini_client(api_key: str):
    """사용자의 구글 Gemini API 키로 클라이언트 생성"""
    return genai.Client(api_key=api_key)

# ---------------------------------------------------------
# 3. 배경 이미지 생성 (텍스트 없음 보장)
# ---------------------------------------------------------
def generate_background_image(api_key: str, category: str, mood: str, brand: str, extra_desc: str = "") -> Optional[bytes]:
    """
    Gemini 이미지 생성 모델로 텍스트가 없는 배경 이미지를 생성합니다.
    어떤 입력이 들어와도 NO_TEXT_INSTRUCTION이 반드시 포함됩니다.
    """
    client = get_gemini_client(api_key)
    
    # 카테고리별 분위기 힌트
    category_hints = {
        "cafe": "cozy cafe atmosphere, warm lighting, coffee and pastry elements, wooden textures",
        "restaurant": "elegant dining atmosphere, food styling elements, rich warm colors",
        "beauty": "clean modern beauty salon, soft pastel colors, floral elements, luxury feel",
        "fashion": "modern boutique aesthetic, clean minimalist design, fashion editorial style",
        "fitness": "energetic gym atmosphere, dynamic angles, bold strong colors",
        "pet": "warm playful atmosphere, soft colors, friendly and cute elements",
        "education": "bright clean learning space, organized and professional",
        "medical": "clean clinical white space, calming blue tones, professional medical aesthetic",
        "food_delivery": "appetizing food photography backdrop, fresh ingredients as decorative elements",
        "general": "professional business background, clean modern design"
    }
    
    mood_map = {
        "warm": "warm, cozy, inviting, golden hour lighting, soft amber tones",
        "luxury": "premium, elegant, sophisticated, dark rich tones, gold accents",
        "bold": "vibrant, energetic, high contrast, striking colors, dynamic composition",
        "fun": "playful, colorful, joyful, bright cheerful colors, festive",
        "clean": "minimalist, clean, modern, light colors, lots of white space",
        "nature": "natural, organic, fresh greens, botanical elements, outdoor feel"
    }
    
    cat_hint = category_hints.get(category, category_hints["general"])
    mood_hint = mood_map.get(mood, mood)
    
    prompt = f"""
Create a stunning, professional advertisement background image.

Business type: {category} ({cat_hint})
Visual mood: {mood_hint}
Brand context: {brand}
{f'Additional details: {extra_desc}' if extra_desc else ''}

Design requirements:
- Create a rich, hyper-realistic studio background perfect for a commercial product photoshoot.
- MUST DO: Avoid excessive symmetry. Remove any unrealistic glossy or plastic look. 
- MUST DO: Correct any micro-anatomical distortions. Use natural, imperfect textures with a manual texture editing feel.
- Lighting: Highly realistic studio lighting, soft diffuse shadows, no harsh artificial AI lighting.
- Leave intentional empty space in the center where products will be placed later.
- Use colors and composition that evoke the mood: {mood_hint}
- 9:16 portrait format composition.

{NO_TEXT_INSTRUCTION}
"""
    
    prompt = NaturalizerPipeline.preprocess_prompt(prompt)
    
    try:
        result = client.models.generate_content(
            model='gemini-2.0-flash-preview-image-generation',
            contents=[prompt],
            config=types.GenerateContentConfig(
                response_modalities=['TEXT', 'IMAGE']
            )
        )
        
        if result.candidates and result.candidates[0].content.parts:
            for part in result.candidates[0].content.parts:
                if hasattr(part, 'inline_data') and part.inline_data and part.inline_data.data:
                    return NaturalizerPipeline.postprocess_image(part.inline_data.data)
        return None
    except Exception as e:
        print(f"Background generation error (gemini-2.0-flash-preview-image-generation): {e}")
        
        # Fallback: gemini-3.1-flash-image-preview 시도
        try:
            result = client.models.generate_content(
                model='gemini-3.1-flash-image-preview',
                contents=[prompt],
                config=types.GenerateContentConfig(
                    response_modalities=['TEXT', 'IMAGE']
                )
            )
            if result.candidates and result.candidates[0].content.parts:
                for part in result.candidates[0].content.parts:
                    if hasattr(part, 'inline_data') and part.inline_data and part.inline_data.data:
                        return NaturalizerPipeline.postprocess_image(part.inline_data.data)
        except Exception as e2:
            print(f"Fallback generation error: {e2}")
        
        return None

# ---------------------------------------------------------
# 3b. 일러스트레이션 팜플렛 생성 함수 (Image-to-Illustration)
# ---------------------------------------------------------
ILLUSTRATION_STYLE_MAP = {
    # 무드 기반 자동 매핑 (화풍을 선택하지 않았을 때 폴백)
    "warm":    "soft watercolor illustration style, warm golden tones, hand-painted brushstrokes, cozy and inviting, gentle color washes, paper texture",
    "luxury":  "elegant Art Deco illustration, fine gold ink linework, sophisticated editorial drawing, high-fashion magazine illustration, rich deep tones",
    "bold":    "bold pop art illustration, strong thick outlines, vibrant flat colors, energetic graphic design, Lichtenstein-inspired comic style",
    "fun":     "cute kawaii sticker illustration, pastel colors, playful chibi character style, bubbly shapes, joyful and whimsical, colorful doodle art",
    "clean":   "minimalist line art illustration, clean monochrome accents, simple flat vector style, Scandinavian design aesthetic, white space",
    "nature":  "lush botanical illustration, detailed hand-drawn leaves and flowers, watercolor nature art, organic earthy tones, garden journal style",
}

# 사용자가 직접 선택하는 화풍 스타일 맵
USER_STYLE_MAP = {
    "watercolor": "soft watercolor illustration, translucent color washes, visible brush texture, hand-painted feel, bleeding ink edges, delicate and fluid",
    "artdeco":    "elegant Art Deco illustration, fine gold and black ink linework, geometric ornamental patterns, high-fashion editorial, 1920s glamour",
    "popart":     "bold pop art style, thick black outlines, flat saturated colors, Ben-Day dots, Roy Lichtenstein-inspired, high contrast comic aesthetic",
    "kawaii":     "super cute kawaii illustration, pastel color palette, rounded bubbly shapes, chibi proportions, playful sticker art, joyful and whimsical",
    "lineart":    "clean minimalist line art, precise single-weight lines, sparse flat color fills, Scandinavian graphic design, elegant negative space",
    "botanical":  "lush botanical illustration, detailed hand-drawn leaves and flowers, naturalist field guide style, earthy greens and warm tones, organic textures",
}

def generate_illustration_pamphlet(api_key: str, image_bytes_list: list, mood: str, brand: str, category: str, desc: str, style: str = "", address: str = "", promo: str = "") -> bytes | None:
    """
    제품 사진을 일러스트 스타일로 재해석하여 완성된 팜플렛 한 장을 생성합니다.
    """
    client = genai.Client(api_key=api_key)
    # 사용자가 직접 화풍을 선택했으면 우선 적용, 아니면 무드 기반 자동 선택
    style_hint = USER_STYLE_MAP.get(style) or ILLUSTRATION_STYLE_MAP.get(mood, ILLUSTRATION_STYLE_MAP["warm"])

    brand_line = f"Brand/Store name: {brand}" if brand else ""
    address_line = f"Store Address: {address}" if address else ""
    promo_line = f"Promotional Message: {promo}" if promo else ""
    desc_line  = f"Product description: {desc}" if desc else ""
    cat_line   = f"Business category: {category}" if category else ""

    prompt = f"""You are Beatrix Potter and Hayao Miyazaki's favourite human illustrator — your work is celebrated for its warm, imperfect, hand-crafted charm that NO digital tool can replicate.

Your task: transform the product image(s) below into a single, complete, HAND-CRAFTED illustrated advertisement poster.
IMPORTANT: You MUST elegantly integrate the following text into the illustration:
{brand_line}
{address_line}
{promo_line}

Make sure the text is clearly visible, readable, and beautifully handwritten or painted to match the illustration style. The text should be incorporated as a natural part of the poster design.

Illustration style: {style_hint}

{cat_line}
{desc_line}

Mandatory human-touch directives (these are NON-NEGOTIABLE):
- Lines must have SLIGHT natural tremor and varying weight — NOT perfectly smooth or uniform.
- Colors must bleed slightly at edges, with visible texture from the physical medium (paper grain, canvas weave, or watercolor paper tooth).
- Include at least one 'happy accident': a small paint drip, uneven ink blot, or soft brushstroke that went slightly outside the lines.
- Shading must use crosshatching, stippling, or dry-brush — NOT smooth airbrushed gradients.
- Composition must be intentionally ASYMMETRIC with generous breathing room — like a real artist chose the layout intuitively.
- The background environment should feel PAINTED, not rendered — imperfect depth, soft edges.
- Color palette must feel HAND-MIXED: slightly muted, warm, slightly inconsistent — NOT oversaturated digital colors.
- DO NOT make it look clean, crisp, or polished. Embrace the beautiful imperfections of traditional media.
- Generate the final image in a 3:4 portrait aspect ratio.
"""

    contents: list = []
    for img_bytes in image_bytes_list:
        contents.append(types.Part.from_bytes(data=img_bytes, mime_type='image/jpeg'))
    contents.append(prompt)

    try:
        result = client.models.generate_content(
            model='gemini-3.1-flash-image-preview',
            contents=contents,
            config=types.GenerateContentConfig(
                response_modalities=['IMAGE']
            )
        )
        if result.candidates and result.candidates[0].content.parts:
            for part in result.candidates[0].content.parts:
                if hasattr(part, 'inline_data') and part.inline_data and part.inline_data.data:
                    return NaturalizerPipeline.postprocess_image(part.inline_data.data)
        return None
    except Exception as e:
        print(f"Illustration generation error: {e}")
        return None


# ---------------------------------------------------------
@app.post("/v1/generate-background")
@limiter.limit("20/minute")
async def generate_background_endpoint(
    request: Request,
    category: Annotated[str, Form()] = "general",
    mood: Annotated[str, Form()] = "warm",
    brand: Annotated[str, Form()] = "",
    extra_desc: Annotated[str, Form()] = "",
    x_gemini_api_key: Annotated[Optional[str], Header()] = None
):
    """
    사용자의 Gemini API 키로 광고 배경 이미지를 생성합니다.
    생성된 이미지에는 절대 텍스트가 포함되지 않습니다.
    """
    api_key = x_gemini_api_key or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="서버에 GEMINI_API_KEY 환경변수가 설정되지 않았거나 X-Gemini-API-Key 헤더가 없습니다.")
    
    generated_bytes = generate_background_image(
        api_key=api_key,
        category=category,
        mood=mood,
        brand=brand,
        extra_desc=extra_desc
    )
    
    if not generated_bytes:
        raise HTTPException(
            status_code=500,
            detail="배경 이미지 생성에 실패했습니다. API 키와 할당량을 확인해주세요."
        )
    
    # 파일 저장
    filename = f"bg_{int(datetime.datetime.now().timestamp())}_{random.randint(1000, 9999)}.png"
    filepath = os.path.join("static", "backgrounds", filename)
    with open(filepath, "wb") as f:
        f.write(generated_bytes)
    
    bg_url = str(request.base_url) + f"static/backgrounds/{filename}"
    
    used_key_id = x_gemini_api_key[:8] + "..." if x_gemini_api_key else "unknown"
    log_billing(used_key_id, "background")
    
    return {
        "status": "success",
        "background_url": bg_url,
        "message": "배경 이미지가 생성되었습니다. 이미지에 텍스트는 포함되지 않습니다."
    }

# ---------------------------------------------------------
# 4b. API 엔드포인트: 일러스트 팜플렛 생성
# ---------------------------------------------------------
@app.post("/v1/generate-illustration")
@limiter.limit("10/minute")
async def generate_illustration_endpoint(
    request: Request,
    images: List[UploadFile] = File(...),
    mood: Annotated[str, Form()] = "warm",
    brand: Annotated[str, Form()] = "",
    address: Annotated[str, Form()] = "",
    promo: Annotated[str, Form()] = "",
    category: Annotated[str, Form()] = "general",
    desc: Annotated[str, Form()] = "",
    style: Annotated[str, Form()] = "",
    x_gemini_api_key: Annotated[Optional[str], Header()] = None
):
    """
    업로드된 제품 사진들을 일러스트 스타일로 재해석한 완성 팜플렛을 반환합니다.
    """
    api_key = x_gemini_api_key or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY가 설정되지 않았습니다.")
    if not images:
        raise HTTPException(status_code=400, detail="제품 이미지를 최소 1개 이상 업로드해 주세요.")

    image_bytes_list = []
    for img_file in images:
        img_bytes = await img_file.read()
        image_bytes_list.append(img_bytes)

    generated_bytes = generate_illustration_pamphlet(
        api_key=api_key,
        image_bytes_list=image_bytes_list,
        mood=mood,
        brand=brand,
        category=category,
        desc=desc,
        style=style,
        address=address,
        promo=promo
    )

    if not generated_bytes:
        raise HTTPException(status_code=500, detail="일러스트 팜플렛 생성에 실패했습니다.")

    filename = f"illust_{int(datetime.datetime.now().timestamp())}_{random.randint(1000,9999)}.png"
    filepath = os.path.join("static", "backgrounds", filename)
    with open(filepath, "wb") as f:
        f.write(generated_bytes)

    illust_url = str(request.base_url) + f"static/backgrounds/{filename}"

    used_key_id = x_gemini_api_key[:8] + "..." if x_gemini_api_key else "unknown"
    log_billing(used_key_id, "illustration")

    return {
        "status": "success",
        "illustration_url": illust_url,
        "message": "일러스트 팜플렛이 생성되었습니다."
    }

# ---------------------------------------------------------
# 5. API 엔드포인트: B2B 팜플렛 생성 (기존 유지)
# ---------------------------------------------------------
# 5. API 엔드포인트: 누끼 따기 (배경 제거)
# ---------------------------------------------------------
@app.post("/v1/remove-bg")
@limiter.limit("50/minute")
async def remove_background_endpoint(
    request: Request,
    image: UploadFile = File(...)
):
    if not remove:
        raise HTTPException(status_code=500, detail="rembg 라이브러리가 설치되지 않았습니다.")
    
    img_bytes = await image.read()
    try:
        # 배경 제거 수행
        output_bytes = remove(img_bytes)
        return Response(content=output_bytes, media_type="image/png")
    except Exception as e:
        print(f"Background removal error: {e}")
        raise HTTPException(status_code=500, detail=f"배경 제거 중 오류가 발생했습니다: {str(e)}")

# ---------------------------------------------------------
def generate_ai_pamphlet(api_key: str, img_bytes, brand, item, tone, catKey, slogan, promo, detail, contact, tagline):
    """
    Gemini 이미지 모델로 업로드된 사진 기반 홍보 팜플렛을 완성된 형태로 생성합니다.
    (배경뿐만 아니라 브랜드명 등 텍스트 타이포그래피까지 모두 포함)
    """
    client = get_gemini_client(api_key)
    
    prompt = f"""
You are a master advertisement designer and typography expert.
Using the provided photo, generate a COMPLETE, ready-to-publish promotional poster.

Brand Name to integrate: "{brand}"
Product/Service: "{item}"
Mood/Style: {tone}

Design instructions:
1. Beautifully integrate the provided photo into a stunning background matching the '{tone}' mood.
2. The final image MUST contain the Brand Name ("{brand}") in a large, elegant, and readable typography.
3. Ensure the text typography looks professional, uses appropriate fonts and colors that match the mood, and does NOT have spelling errors.
4. The composition must be a finished advertisement pamphlet, NOT just a blank background.
"""
    
    try:
        result = client.models.generate_content(
            model='gemini-3.1-flash-image-preview',
            contents=[
                types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
                prompt
            ],
            config=types.GenerateContentConfig(
                response_modalities=['TEXT', 'IMAGE']
            )
        )
        if result.candidates and result.candidates[0].content.parts:
            for part in result.candidates[0].content.parts:
                if hasattr(part, 'inline_data') and part.inline_data and part.inline_data.data:
                    return part.inline_data.data
        return None
    except Exception as e:
        print(f"Pamphlet generation error: {e}")
        return None

@app.post("/v1/generate")
@limiter.limit("10/minute")
async def generate_images_endpoint(
    request: Request,
    images: Annotated[List[UploadFile], File(...)],
    brand: Annotated[str, Form()] = "",
    item: Annotated[str, Form()] = "",
    slogan: Annotated[str, Form()] = "",
    promo: Annotated[str, Form()] = "",
    detail: Annotated[str, Form()] = "",
    contact: Annotated[str, Form()] = "",
    tagline: Annotated[str, Form()] = "",
    tone: Annotated[str, Form()] = "warm",
    catKey: Annotated[str, Form()] = "product",
    x_gemini_api_key: Annotated[Optional[str], Header()] = None,
    client_name: Annotated[Optional[str], Depends(get_client_name)] = None
):
    # API 키 결정 (사용자 키 우선, 없으면 서버 기본 키)
    gemini_key = x_gemini_api_key or os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        raise HTTPException(status_code=500, detail="서버에 GEMINI_API_KEY가 설정되지 않았습니다.")
    
    img_bytes = await images[0].read()
    results = []
    
    for i in range(1):
        generated_bytes = generate_ai_pamphlet(
            gemini_key, img_bytes, brand, item, tone, catKey, slogan, promo, detail, contact, tagline
        )
        
        if generated_bytes:
            filename = f"pamphlet_ai_{int(datetime.datetime.now().timestamp())}_{random.randint(1000, 9999)}.png"
            filepath = os.path.join("static", "pamphlets", filename)
            with open(filepath, "wb") as f:
                f.write(generated_bytes)
            
            pamphlet_url = str(request.base_url) + f"static/pamphlets/{filename}"
            results.append({
                "themeKey": tone,
                "themeName": f"AI 생성버전 {i+1}",
                "brand": brand,
                "pamphlet_url": pamphlet_url
            })
    
    if not results:
        raise HTTPException(status_code=500, detail="AI 이미지 생성에 실패했습니다.")
    
    if client_name:
        log_billing(client_name)
    
    return {
        "status": "success",
        "client": client_name or "direct_user",
        "result": results
    }

# ---------------------------------------------------------
# 6. 메인 페이지 서빙
# ---------------------------------------------------------
@app.get("/", response_class=HTMLResponse)
async def serve_index():
    with open("index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.get("/v1/billing")
@limiter.limit("30/minute")
async def get_billing(
    request: Request,
    x_gemini_api_key: Annotated[Optional[str], Header()] = None,
):
    key_id = (x_gemini_api_key[:8] + "...") if x_gemini_api_key else "unknown"
    usage = billing_db.get(key_id, {"count": 0, "last_used": None})
    return {
        "status": "success",
        "usage_this_session": usage["count"],
        "last_called": usage["last_used"]
    }
