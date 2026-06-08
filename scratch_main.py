import os
import io
import json
import base64
import random
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from pydantic import BaseModel
from PIL import Image, ImageDraw, ImageFont

# TODO: Gemini API Key Setting
genai_client = genai.Client(api_key="YOUR_GEMINI_API_KEY")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

THEMES = {
  'warm':   {'name':'따뜻형',   'bg':['#FF6B35','#FF8C42'], 'text1':'#ffffff', 'text2':'rgba(255,255,255,0.9)', 'text3':'rgba(255,255,255,0.7)', 'badge':'#FF3D00', 'badgeText':'#ffffff', 'accent':'#FFE0CC', 'overlay':'rgba(190,55,0,0.52)'},
  'luxury': {'name':'고급형',   'bg':['#1A1A2E','#0F3460'], 'text1':'#ffffff', 'text2':'rgba(255,255,255,0.85)', 'text3':'#C9A84C', 'badge':'#C9A84C', 'badgeText':'#1A1A2E', 'accent':'#C9A84C', 'overlay':'rgba(10,10,40,0.58)'},
  'bold':   {'name':'임팩트형', 'bg':['#DC2626','#7F1D1D'], 'text1':'#ffffff', 'text2':'rgba(255,255,255,0.9)', 'text3':'rgba(255,180,180,0.9)', 'badge':'#ffffff', 'badgeText':'#DC2626', 'accent':'#FCA5A5', 'overlay':'rgba(120,0,0,0.5)'},
  'fun':    {'name':'재치형',   'bg':['#7C3AED','#2563EB'], 'text1':'#ffffff', 'text2':'rgba(255,255,255,0.9)', 'text3':'#FDE68A', 'badge':'#FDE68A', 'badgeText':'#4C1D95', 'accent':'#FDE68A', 'overlay':'rgba(50,0,130,0.5)'},
  'clean':  {'name':'심플형',   'bg':['#F8F9FA','#DEE2E6'], 'text1':'#1C1917', 'text2':'#3D3835', 'text3':'#78716C', 'badge':'#1C1917', 'badgeText':'#ffffff', 'accent':'#1C1917', 'overlay':'rgba(28,25,23,0.42)'},
  'nature': {'name':'자연형',   'bg':['#14532D','#065F46'], 'text1':'#ffffff', 'text2':'rgba(255,255,255,0.9)', 'text3':'#BBF7D0', 'badge':'#BBF7D0', 'badgeText':'#14532D', 'accent':'#BBF7D0', 'overlay':'rgba(5,50,20,0.52)'},
}

def hex_to_rgb(hex_str):
    hex_str = hex_str.lstrip('#')
    if len(hex_str) == 3:
        hex_str = ''.join([c*2 for c in hex_str])
    return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))

def rgba_to_tuple(rgba_str):
    if rgba_str.startswith('#'):
        return hex_to_rgb(rgba_str) + (255,)
    if rgba_str.startswith('rgba'):
        parts = rgba_str.strip('rgba()').split(',')
        return (int(parts[0]), int(parts[1]), int(parts[2]), int(float(parts[3])*255))
    return (0,0,0,255)

def create_linear_gradient(size, c1, c2, direction='vertical'):
    base = Image.new('RGBA', size)
    draw = ImageDraw.Draw(base)
    w, h = size
    if direction == 'vertical':
        for y in range(h):
            r = int(c1[0] + (c2[0] - c1[0]) * y / h)
            g = int(c1[1] + (c2[1] - c1[1]) * y / h)
            b = int(c1[2] + (c2[2] - c1[2]) * y / h)
            a = c1[3] + (c2[3] - c1[3]) * y / h if len(c1)==4 else 255
            draw.line([(0, y), (w, y)], fill=(r, g, b, int(a)))
    return base

def wrap_text(draw, text, font, max_width):
    lines = []
    for line in text.split('\\n'):
        current_line = ''
        for char in line:
            test_line = current_line + char
            bbox = draw.textbbox((0,0), test_line, font=font)
            width = bbox[2] - bbox[0]
            if width > max_width and current_line:
                lines.append(current_line)
                current_line = char
            else:
                current_line = test_line
        if current_line:
            lines.append(current_line)
    return lines

def generate_gemini_copy(brand, item, tone, catKey, user_slogan, user_tagline):
    # If user provided everything, we could just return, but let's use Gemini to generate headline and CTA
    prompt = f"""
    당신은 전문 마케팅 카피라이터입니다. 다음 정보를 바탕으로 홍보 팜플렛에 들어갈 텍스트를 작성해주세요.
    반드시 아래 JSON 형식으로만 답변하세요. 다른 부연 설명은 하지 마세요.

    브랜드명: {brand}
    상품/서비스명: {item}
    분위기: {tone}
    카테고리: {catKey}

    결과 포맷:
    {{
        "hl": "매력적이고 짧은 메인 헤드라인 (상품명이나 브랜드명 포함, 15자 이내)",
        "cta": "행동을 유도하는 짧은 문구 (예: 지금 만나보세요 →)",
        "slogan": "{user_slogan if user_slogan else '10자 내외의 감성적이거나 신뢰를 주는 짧은 슬로건'}",
        "tags": "{user_tagline if user_tagline else '#상품 #브랜드 #분위기와_어울리는_해시태그 3~4개'}"
    }}
    """
    
    try:
        response = genai_client.models.generate_content(
            model='gemini-1.5-flash',
            contents=prompt
        )
        text = response.text.strip()
        if text.startswith('```json'):
            text = text[7:-3]
        if text.endswith('```'):
            text = text[:-3].strip()
        return json.loads(text)
    except Exception as e:
        print("Gemini Error:", e)
        # Fallback
        return {
            "hl": f"{brand}의 특별한 {item}",
            "cta": "지금 바로 확인하세요 →",
            "slogan": user_slogan if user_slogan else "당신의 일상을 특별하게",
            "tags": user_tagline if user_tagline else f"#{brand} #{item} #추천"
        }

def draw_pamphlet(img_bytes, theme_key, data, brand, item, promo, detail, contact):
    CW, CH = 630, 840
    img = Image.new('RGBA', (CW, CH))
    draw = ImageDraw.Draw(img)
    th = THEMES[theme_key]
    
    # 1. Background gradient
    c1 = hex_to_rgb(th['bg'][0])
    c2 = hex_to_rgb(th['bg'][1])
    bg_grad = create_linear_gradient((CW, CH), c1 + (255,), c2 + (255,))
    img.paste(bg_grad, (0,0))
    
    # 2. Decorative circles
    overlay_layer = Image.new('RGBA', (CW, CH), (0,0,0,0))
    o_draw = ImageDraw.Draw(overlay_layer)
    o_draw.ellipse([CW+20-200, -40-200, CW+20+200, -40+200], fill=(255,255,255,18))
    o_draw.ellipse([-30-170, CH+30-170, -30+170, CH+30+170], fill=(255,255,255,18))
    o_draw.ellipse([CW//2-280, CH*0.75-280, CW//2+280, CH*0.75+280], fill=(255,255,255,9))
    img = Image.alpha_composite(img, overlay_layer)
    draw = ImageDraw.Draw(img)

    # 3. Photo Area
    img_area_h = int(CH * 0.52)
    pad = 22
    slot_w, slot_h = CW - pad*2, img_area_h - 10
    
    orig_img = Image.open(io.BytesIO(img_bytes)).convert('RGBA')
    i_w, i_h = orig_img.size
    i_aspect, s_aspect = i_w / i_h, slot_w / slot_h
    if i_aspect > s_aspect:
        new_w = int(i_h * s_aspect)
        left = (i_w - new_w) // 2
        orig_img = orig_img.crop((left, 0, left + new_w, i_h))
    else:
        new_h = int(i_w / s_aspect)
        top = (i_h - new_h) // 2
        orig_img = orig_img.crop((0, top, i_w, top + new_h))
    orig_img = orig_img.resize((slot_w, slot_h), Image.Resampling.LANCZOS)
    
    mask = Image.new('L', (slot_w, slot_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, slot_w, slot_h], radius=18, fill=255)
    
    orig_img_with_mask = Image.new('RGBA', orig_img.size)
    orig_img_with_mask.paste(orig_img, (0,0), mask)

    # Overlay gradient
    c1_ov = (0, 0, 0, 0)
    c2_ov = rgba_to_tuple(th['overlay'])
    grad_h = int(slot_h * 0.65)
    grad = create_linear_gradient((slot_w, grad_h), c1_ov, c2_ov, 'vertical')
    grad_mask = Image.new('L', grad.size)
    grad_mask.putdata([a for r,g,b,a in grad.getdata()])
    
    orig_img_with_mask.paste(grad, (0, slot_h - grad_h), grad_mask)
    img.paste(orig_img_with_mask, (pad, pad), orig_img_with_mask)
    
    # 4. Fonts
    font_path_bold = "C:/Windows/Fonts/malgunbd.ttf"
    font_path_reg = "C:/Windows/Fonts/malgun.ttf"
    
    try:
        font_brand = ImageFont.truetype(font_path_bold, 15)
        font_hl = ImageFont.truetype(font_path_bold, 42)
        font_slogan = ImageFont.truetype(font_path_reg, 20)
        font_detail = ImageFont.truetype(font_path_reg, 17)
        font_promo = ImageFont.truetype(font_path_bold, 18)
        font_cta = ImageFont.truetype(font_path_bold, 18)
        font_contact = ImageFont.truetype(font_path_reg, 13)
        font_tag = ImageFont.truetype(font_path_reg, 13)
    except IOError:
        font_brand = font_hl = font_slogan = font_detail = font_promo = font_cta = font_contact = font_tag = ImageFont.load_default()

    # 5. Brand Badge
    brand_txt = brand if brand else '브랜드'
    bbox = draw.textbbox((0,0), brand_txt, font=font_brand)
    bw, bh = bbox[2] - bbox[0] + 28, 34
    draw.rounded_rectangle([pad+12, pad+12, pad+12+bw, pad+12+bh], radius=8, fill=rgba_to_tuple(th['badge']))
    draw.text((pad+12+bw/2, pad+12+bh/2), brand_txt, fill=rgba_to_tuple(th['badgeText']), font=font_brand, anchor="mm")

    # 6. Text Block
    cur_y = img_area_h + 20
    text_pad = 32
    max_w = CW - text_pad*2
    
    hl_lines = wrap_text(draw, data['hl'], font_hl, max_w)
    for line in hl_lines:
        draw.text((text_pad, cur_y), line, fill=rgba_to_tuple(th['text1']), font=font_hl)
        cur_y += 52
    cur_y += 10
    
    slg_lines = wrap_text(draw, data['slogan'], font_slogan, max_w)
    for line in slg_lines:
        draw.text((text_pad, cur_y), line, fill=rgba_to_tuple(th['text2']), font=font_slogan)
        cur_y += 30
    cur_y += 10
    
    if detail:
        short_detail = detail[:38]+'…' if len(detail)>40 else detail
        draw.text((text_pad, cur_y), '✔ ' + short_detail, fill=rgba_to_tuple(th['text3']), font=font_detail)
        cur_y += 32

    # 7. Promo
    if promo:
        promo_y = CH - 120
        draw.rounded_rectangle([text_pad, promo_y, CW-text_pad, promo_y+42], radius=10, fill=(255,255,255,40), outline=(255,255,255,64), width=1)
        draw.text((CW/2, promo_y+21), '🎉 ' + promo, fill=rgba_to_tuple(th['accent']), font=font_promo, anchor="mm")
        
    # 8. CTA
    cta_y = CH - 66
    draw.rounded_rectangle([text_pad, cta_y, CW-text_pad, cta_y+42], radius=10, fill=rgba_to_tuple(th['badge']))
    draw.text((CW/2, cta_y+21), data['cta'], fill=rgba_to_tuple(th['badgeText']), font=font_cta, anchor="mm")

    # 9. Contact
    if contact:
        draw.text((CW - pad - 10, img_area_h + pad - 14), contact, fill=(255,255,255,190), font=font_contact, anchor="rd")
        
    # 10. Hashtags
    draw.text((CW/2, CH - 6), data['tags'], fill=rgba_to_tuple(th['text3']), font=font_tag, anchor="md")
    
    output = io.BytesIO()
    img.save(output, format='PNG')
    return base64.b64encode(output.getvalue()).decode('utf-8')

@app.post("/generate")
async def generate_images(
    images: List[UploadFile] = File(...),
    brand: str = Form(""),
    item: str = Form(""),
    slogan: str = Form(""),
    promo: str = Form(""),
    detail: str = Form(""),
    contact: str = Form(""),
    tagline: str = Form(""),
    tone: str = Form("warm"),
    catKey: str = Form("product")
):
    # Generate Copy via Gemini
    copy_data = generate_gemini_copy(brand, item, tone, catKey, slogan, tagline)
    
    # Read the first uploaded image bytes (or multiple if needed)
    img_bytes = await images[0].read()
    
    # Pick 3 themes: tone + 2 random
    all_keys = list(THEMES.keys())
    others = [k for k in all_keys if k != tone]
    random.shuffle(others)
    chosen = [tone, others[0], others[1]]
    
    results = []
    for idx, t_key in enumerate(chosen):
        # We can use different images if user uploaded multiple
        curr_bytes = img_bytes
        if len(images) > idx:
            # We must reset and read again if we use multiple images, but for simplicity:
            await images[idx % len(images)].seek(0)
            curr_bytes = await images[idx % len(images)].read()
            
        b64_img = draw_pamphlet(curr_bytes, t_key, copy_data, brand, item, promo, detail, contact)
        results.append({
            "themeKey": t_key,
            "themeName": THEMES[t_key]['name'],
            "brand": brand,
            "base64": f"data:image/png;base64,{b64_img}"
        })
        
    return {"results": results}
