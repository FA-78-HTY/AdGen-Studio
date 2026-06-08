# AdGen Studio

**AI 기반 맞춤형 광고 일러스트 팜플렛 제작 & 편집 플랫폼**

소상공인이나 마케터들이 복잡한 전문 디자인 툴 없이도, 자신의 제품 사진만으로 감성적이고 완성도 높은 광고 팜플렛을 손쉽게 만들 수 있도록 도와주는 웹 서비스입니다.

## 🌟 주요 기능
* **원클릭 AI 일러스트레이터 (Illustration Fusion)**: 구글 제미나이(Google Gemini) 멀티모달 AI를 활용해 제품 사진의 특징은 유지하면서 전체를 하나의 통일된 수채화, 팝아트 등의 화풍으로 새롭게 그려줍니다.
* **자동 배경 제거 (누끼 따기)**: 이미지를 드래그 앤 드롭하면 원클릭으로 정밀하게 배경을 제거합니다. (`rembg` 기반)
* **대화형 캔버스 에디터 (Interactive Editor)**: AI가 만든 일러스트 위에 사용자가 직접 제목, 본문, 할인 문구 등을 자유롭게 얹고 편집할 수 있는 HTML5 기반 에디터를 제공합니다.

## 🛠️ 핵심 기술 (Prompt Naturalizer)
기존 AI 이미지의 단점(인위적인 플라스틱 질감, 깨진 텍스트 등)을 해결하기 위해 독자적인 파이프라인을 거칩니다.
* **프롬프트 최적화**: 자연스러운 빛, 35mm 필름 감성 등을 자동 주입하고, 텍스트 생성을 강제로 억제합니다 (`NO_TEXT_INSTRUCTION`).
* **이미지 물리적 후처리**: Bilinear/Bicubic 보간법을 활용한 스케일링, 가우시안 필름 노이즈 추가, 대비(Contrast) 감소 등을 통해 아날로그적이고 수작업 같은 질감을 구현합니다.

## 💻 시스템 환경 및 기술 스택
* **Backend**: FastAPI (Python 비동기 처리), `slowapi` (Rate Limiting)
* **Frontend**: Vanilla JS, HTML5 Canvas, CSS
* **AI Model**: Google Gemini API (`gemini-3.1-flash-image-preview` 등)
* **Features**: B2B 클라이언트 API 키 인증(X-Pamphlet-API-Key) 및 요금 정산(Billing) 로그 기능 내장.

## 🚀 로컬 실행 방법

1. 저장소를 클론(Clone)합니다.
2. 가상환경(venv)을 생성하고 패키지를 설치합니다.
   ```bash
   pip install -r requirements.txt
   ```
   *(참고: 프로젝트 구성에 따라 모듈을 수동으로 설치해야 할 수 있습니다: `fastapi`, `uvicorn`, `google-genai`, `rembg`, `python-dotenv` 등)*
3. `.env.example` 파일을 복사하여 `.env` 파일을 만들고, 본인의 **Gemini API 키**를 입력합니다.
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
4. 서버를 실행합니다.
   ```bash
   uvicorn main:app --reload
   ```
5. 웹 브라우저에서 `http://127.0.0.1:8000`에 접속하여 서비스를 이용합니다.
