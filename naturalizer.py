"""
naturalizer.py
==============
AdGen Studio — AI 인위성 제거 파이프라인 모듈

이 모듈은 AI 이미지 생성 결과물에서 나타나는 '플라스틱 질감',
'과도한 완벽함', '기계적 대칭' 등의 인위적 특징을 제거하기 위해
두 가지 핵심 기능을 제공합니다.

  1. optimize_prompt()   — 프롬프트 자동 최적화 (Prompt Naturalizer)
  2. apply_realistic_filter() — 이미지 물리적 후처리 (Post-Processing)
"""

import io
import random
import numpy as np
from PIL import Image, ImageEnhance

# ─────────────────────────────────────────────────────────────
# 상수 정의
# ─────────────────────────────────────────────────────────────

# 기능 1: Positive Prompt에 자동 병합될 '반(Anti)-완벽' 키워드
POSITIVE_NATURALIZER_KEYWORDS: list[str] = [
    "natural lighting",
    "imperfect texture",
    "slight asymmetry",
    "shot on 35mm film",
    "cinematic grain",
    "authentic photo",
    "raw unedited",
]

# 기능 1: Negative Prompt에 강제 적용될 '인위성 억제' 키워드
NEGATIVE_NATURALIZER_KEYWORDS: list[str] = [
    "plastic texture",
    "CGI",
    "3D render",
    "hyperrealistic",
    "perfect symmetry",
    "airbrushed skin",
    "over-detailed",
    "unnatural glow",
    "artificial lighting",
]


# ─────────────────────────────────────────────────────────────
# 기능 1: 프롬프트 자동 최적화 (Prompt Naturalizer)
# ─────────────────────────────────────────────────────────────

def optimize_prompt(user_prompt: str, extra_positive: list[str] | None = None) -> dict[str, str]:
    """
    사용자의 원본 텍스트를 AI 인위성을 억제하는 완벽한 프롬프트 쌍으로 가공합니다.

    Args:
        user_prompt (str): 사용자가 입력한 원본 프롬프트.
                           예) "테이블 위에 놓인 고급 핸드크림 제품 사진"
        extra_positive (list, optional): 추가로 병합할 긍정 키워드 목록.

    Returns:
        dict: {
            "positive": str,  — 최적화된 긍정 프롬프트
            "negative": str,  — 인위성 억제 부정 프롬프트
        }

    동작 원리:
        - Positive: 사용자 입력 뒤에 POSITIVE_NATURALIZER_KEYWORDS를 쉼표(,)로 이어붙입니다.
        - Negative: NEGATIVE_NATURALIZER_KEYWORDS를 기본값으로 고정 주입합니다.
          (DALL-E처럼 Negative 파라미터를 지원하지 않는 모델의 경우,
           반환된 negative 문자열을 positive 프롬프트 끝에 "WITHOUT: ..." 형태로
           직접 삽입하는 것을 권장합니다.)
    """
    if not user_prompt or not user_prompt.strip():
        raise ValueError("user_prompt는 빈 문자열일 수 없습니다.")

    # Positive 처리: 사용자 입력 + 기본 키워드 + 추가 키워드 병합
    all_positive = POSITIVE_NATURALIZER_KEYWORDS.copy()
    if extra_positive:
        all_positive += extra_positive

    positive = f"{user_prompt.strip()}, {', '.join(all_positive)}"

    # Negative 처리: 고정 키워드 강제 주입
    negative = ", ".join(NEGATIVE_NATURALIZER_KEYWORDS)

    return {
        "positive": positive,
        "negative": negative,
    }


def build_single_prompt(user_prompt: str, extra_positive: list[str] | None = None) -> str:
    """
    Negative 파라미터를 지원하지 않는 API(예: Gemini)용으로,
    긍정/부정 프롬프트를 하나의 문자열로 합칩니다.

    Args:
        user_prompt (str): 사용자의 원본 프롬프트.

    Returns:
        str: 단일 합성 프롬프트 문자열.
    """
    parts = optimize_prompt(user_prompt, extra_positive)
    return (
        f"{parts['positive']}\n\n"
        f"WITHOUT (NEVER INCLUDE): {parts['negative']}"
    )


# ─────────────────────────────────────────────────────────────
# 기능 2: 이미지 물리적 후처리 (Post-Processing)
# ─────────────────────────────────────────────────────────────

def apply_realistic_filter(
    image_input: bytes | Image.Image,
    downscale_ratio: float = 0.85,
    grain_opacity: float = 0.12,
    contrast_reduction: float = 0.07,
) -> bytes:
    """
    AI가 생성한 이미지를 물리적으로 가공하여 인위적 느낌을 제거합니다.

    Args:
        image_input (bytes | PIL.Image.Image): 처리할 이미지. 바이트 또는 PIL 객체.
        downscale_ratio (float): 축소 비율 (기본 0.85 = 85% 크기로 축소 후 복원).
        grain_opacity (float): 필름 그레인 불투명도 (기본 0.12 = 12%).
        contrast_reduction (float): 대비 감소율 (기본 0.07 = 7% 낮춤).

    Returns:
        bytes: 후처리가 완료된 이미지의 PNG 바이트.

    세 가지 처리 단계:
        Step 1 — Downscale & Upscale:
            이미지를 0.85배 축소 후 원본 크기로 확대합니다.
            이 과정이 AI 특유의 지나치게 선명한 디지털 픽셀을
            부드럽게 뭉개어(blur) 필름 카메라 특유의 약간 흐린 느낌을 만듭니다.

        Step 2 — Gaussian Film Grain:
            빈 캔버스에 가우시안 노이즈를 생성한 뒤 원본 이미지에 오버레이합니다.
            노이즈 레이어의 불투명도(opacity)를 12% 수준으로 설정하여
            35mm 필름 사진의 자글자글한 그레인 질감을 재현합니다.

        Step 3 — Contrast Reduction:
            AI 이미지는 대비가 과도하게 강해서 비현실적으로 보입니다.
            Pillow의 ImageEnhance.Contrast를 사용하여 대비를 약 7% 낮춰
            현실적인 'Flat Tone' 색감을 유도합니다.
    """
    # --- 입력 타입 정규화 ---
    if isinstance(image_input, bytes):
        img = Image.open(io.BytesIO(image_input)).convert("RGB")
    elif isinstance(image_input, Image.Image):
        img = image_input.convert("RGB")
    else:
        raise TypeError("image_input은 bytes 또는 PIL.Image 객체여야 합니다.")

    original_w, original_h = img.size

    # ── Step 1: Downscale & Upscale ────────────────────────────
    # 축소: Bilinear(2D 선형 보간) — 선명한 픽셀을 자연스럽게 뭉갬
    downscaled_w = max(1, int(original_w * downscale_ratio))
    downscaled_h = max(1, int(original_h * downscale_ratio))
    img_small = img.resize((downscaled_w, downscaled_h), Image.Resampling.BILINEAR)

    # 확대: Bicubic(3차 보간) — 약간의 부드러운 왜곡을 남기며 원본 크기로 복원
    img = img_small.resize((original_w, original_h), Image.Resampling.BICUBIC)

    # ── Step 2: Gaussian Film Grain Overlay ────────────────────
    # Numpy로 가우시안 노이즈 레이어 생성 (평균 128, 표준편차 25)
    # 128을 기준으로 잡아야 오버레이 시 이미지를 밝히거나 어둡게 만들지 않고
    # 순수한 '질감(grain)'만 더할 수 있습니다.
    noise_array = np.random.normal(128, 25, (original_h, original_w, 3)).clip(0, 255).astype(np.uint8)
    noise_layer = Image.fromarray(noise_array, mode="RGB")

    # Screen-like overlay: 원본 이미지와 노이즈를 grain_opacity 비율로 합성
    img_array   = np.array(img,         dtype=np.float32)
    noise_float = np.array(noise_layer, dtype=np.float32)

    # 노이즈 레이어를 (0 ~ +/-range) 범위의 오프셋으로 변환
    # noise_float - 128 → 대략 -100 ~ +100 범위
    grain_offset = (noise_float - 128.0) * grain_opacity
    blended = np.clip(img_array + grain_offset, 0, 255).astype(np.uint8)
    img = Image.fromarray(blended, mode="RGB")

    # ── Step 3: Contrast Reduction ─────────────────────────────
    # ImageEnhance.Contrast: 1.0 = 원본, < 1.0 = 대비 감소
    # contrast_reduction=0.07 이면 factor = 1.0 - 0.07 = 0.93
    contrast_factor = 1.0 - contrast_reduction
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(contrast_factor)

    # ── 최종 바이트 직렬화 ────────────────────────────────────
    out_buf = io.BytesIO()
    img.save(out_buf, format="PNG")
    return out_buf.getvalue()


# ─────────────────────────────────────────────────────────────
# 메인 실행부 — 전체 파이프라인 테스트
# ─────────────────────────────────────────────────────────────

def _dummy_generate_image(positive_prompt: str, size: tuple[int, int] = (768, 1024)) -> bytes:
    """
    이미지 생성 API 호출을 시뮬레이션하는 더미 함수.
    실제 서비스에서는 Gemini / DALL-E / Stable Diffusion API 호출로 대체합니다.

    Returns:
        bytes: 임의의 색상으로 채워진 가상의 이미지 PNG 바이트.
    """
    print(f"  [더미 API] 프롬프트 수신 완료 ({len(positive_prompt)} 글자)")
    print(f"  [더미 API] 이미지 생성 시뮬레이션 중... ({size[0]}x{size[1]}px)")

    # 임의 배경색 + 약간의 노이즈로 '생성된 이미지'처럼 보이게 만들기
    r = random.randint(180, 230)
    g = random.randint(160, 210)
    b = random.randint(140, 190)
    canvas = np.full((size[1], size[0], 3), [r, g, b], dtype=np.uint8)
    canvas += np.random.randint(0, 30, canvas.shape, dtype=np.uint8)

    buf = io.BytesIO()
    Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8)).save(buf, format="PNG")
    return buf.getvalue()


if __name__ == "__main__":
    import os

    print("=" * 60)
    print("  AdGen Naturalizer Pipeline — 전체 흐름 테스트")
    print("=" * 60)

    # ── 1단계: 사용자 입력 ────────────────────────────────────
    user_input = "테이블 위에 놓인 고급 핸드크림 제품 사진"
    print(f"\n[1] 사용자 원본 입력:\n    \"{user_input}\"\n")

    # ── 2단계: 프롬프트 최적화 ───────────────────────────────
    optimized = optimize_prompt(user_input)
    print("[2] 프롬프트 최적화 완료:")
    print(f"    ✅ Positive ({len(optimized['positive'])} 글자):")
    print(f"       {optimized['positive']}\n")
    print(f"    🚫 Negative ({len(optimized['negative'])} 글자):")
    print(f"       {optimized['negative']}\n")

    # ── 3단계: 이미지 생성 시뮬레이션 (더미) ─────────────────
    print("[3] 이미지 생성 API 호출 (시뮬레이션):")
    raw_image_bytes = _dummy_generate_image(optimized["positive"])
    print(f"    원본 이미지 크기: {len(raw_image_bytes):,} bytes\n")

    # ── 4단계: 물리적 후처리 필터 적용 ──────────────────────
    print("[4] 물리적 후처리 필터 적용 중...")
    print("    → Step 1: Downscale(85%) & Upscale 리사이징")
    print("    → Step 2: Gaussian Film Grain 오버레이 (opacity 12%)")
    print("    → Step 3: Contrast 7% 감소 (Flat Tone)")
    filtered_bytes = apply_realistic_filter(
        raw_image_bytes,
        downscale_ratio=0.85,
        grain_opacity=0.12,
        contrast_reduction=0.07,
    )
    print(f"    후처리 완료! 결과 크기: {len(filtered_bytes):,} bytes\n")

    # ── 5단계: 최종 파일 저장 ────────────────────────────────
    output_path = os.path.join(os.path.dirname(__file__), "naturalizer_test_output.png")
    with open(output_path, "wb") as f:
        f.write(filtered_bytes)

    print(f"[5] 최종 파일 저장 완료:\n    → {output_path}")
    print("\n" + "=" * 60)
    print("  파이프라인 테스트 성공! ✅")
    print("=" * 60)
