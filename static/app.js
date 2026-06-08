// ══════════════════════════════════════════
//  APP.JS — 메인 진입점 + 화면 전환 + API 호출
// ══════════════════════════════════════════

// ── 유틸 ──
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 2800);
}

function showLoading(msg = 'AI가 배경을 생성하고 있습니다...') {
  document.getElementById('loading-text').textContent = msg;
  document.getElementById('loading-overlay').classList.add('active');
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.remove('active');
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── 사진 파일 처리 ──
function handlePhotoFiles(files) {
  files.forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      State.uploadedPhotos.push({ id: makeId(), dataUrl: e.target.result, name: file.name });
      renderPhotoPreviews();
      updatePhotoPanel();
    };
    reader.readAsDataURL(file);
  });
}

function renderPhotoPreviews() {
  const container = document.getElementById('photo-previews');
  container.innerHTML = '';
  State.uploadedPhotos.forEach((photo, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'photo-thumb-wrap';
    wrap.innerHTML = `
      <img class="photo-thumb" src="${photo.dataUrl}" alt="사진 ${idx + 1}">
      <button class="remove-btn" data-idx="${idx}">✕</button>
    `;
    wrap.querySelector('.remove-btn').addEventListener('click', () => {
      State.uploadedPhotos.splice(idx, 1);
      renderPhotoPreviews();
      updatePhotoPanel();
    });
    container.appendChild(wrap);
  });

  const statusAssets = document.getElementById('status-assets');
  if (statusAssets) {
    statusAssets.textContent = State.uploadedPhotos.length + ' 개 파일';
  }
}

// ── API: 배경 누끼 제거 ──
async function removeBackgroundForPhotos() {
  const newPhotos = [];
  for (let i = 0; i < State.uploadedPhotos.length; i++) {
    const photo = State.uploadedPhotos[i];
    try {
      showLoading(`누끼 작업 중... (${i+1}/${State.uploadedPhotos.length})`);
      const fetchRes = await fetch(photo.dataUrl);
      const blob = await fetchRes.blob();
      
      const form = new FormData();
      form.append('image', blob, photo.name || 'image.png');
      
      const res = await fetch('/v1/remove-bg', { method: 'POST', body: form });
      if (!res.ok) throw new Error('누끼 제거 실패');
      
      const outBlob = await res.blob();
      const outDataUrl = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.readAsDataURL(outBlob);
      });
      
      newPhotos.push({ ...photo, dataUrl: outDataUrl });
    } catch (e) {
      console.error(e);
      newPhotos.push(photo); // 실패 시 원본 사용
    }
  }
  State.uploadedPhotos = newPhotos;
}

// ── API: 배경 이미지 생성 ──
async function generateBackground() {
  const { setupData } = State;

  showLoading('AI가 작업을 진행 중입니다...\n(최대 30초 소요될 수 있습니다)');

  try {
    const form = new FormData();
    const endpoint = '/v1/generate-background';
    form.append('category', State.setupData.category);
    form.append('mood', State.setupData.mood);
    form.append('extra_desc', State.setupData.desc);

    const res = await fetch(endpoint, {
      method: 'POST',
      body: form,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `서버 오류 ${res.status}`);
    }

    const data = await res.json();
    hideLoading();
    return data.background_url;
  } catch (e) {
    hideLoading();
    showToast('생성 실패: ' + e.message, 'error');
    return null;
  }
}

// ── 배경 이미지 로드 ──
function loadBackgroundImage(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      State.backgroundImage = img;
      State.backgroundUrl = url;
      renderCanvas();
      resolve(true);
    };
    img.onerror = () => {
      showToast('배경 이미지 로드 실패', 'error');
      resolve(false);
    };
    img.src = url;
  });
}

// ── PNG 내보내기 ──
function exportPNG() {
  const prevSelected = State.selectedLayerId;
  State.selectedLayerId = null;
  renderCanvas();

  const a = document.createElement('a');
  a.download = `${State.setupData.brand || 'ad'}_admaker.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();

  State.selectedLayerId = prevSelected;
  renderCanvas();
  showToast('PNG 다운로드 완료! ✅', 'success');
}

// ══════════════════════════════════════════
//  SCREEN 1: 로그인
// ══════════════════════════════════════════
function initLoginScreen() {
  const savedUser = localStorage.getItem('adgen_user_info');
  if (savedUser) {
    try {
      State.userInfo = JSON.parse(savedUser);
      document.getElementById('user-badge').classList.add('visible');
      document.getElementById('user-avatar').src = State.userInfo.picture;
      document.getElementById('user-name').textContent = State.userInfo.name;
      document.getElementById('setup-avatar').src = State.userInfo.picture;
      document.getElementById('setup-username').textContent = State.userInfo.email;
      
      // 약간의 지연 후 바로 setup 스크린으로 이동
      setTimeout(() => {
        showScreen('screen-setup');
      }, 100);
    } catch (e) {
      localStorage.removeItem('adgen_user_info');
    }
  }

  document.getElementById('btn-google-login').addEventListener('click', () => {
    // 실제 구글 로그인 연동 (OAuth2 Token Client 사용)
    const CLIENT_ID = '148488452116-j9evooul30spoecghg5jno85jerha1i5.apps.googleusercontent.com'; // TODO: 구글 클라우드 콘솔에서 발급받은 실제 Client ID를 입력하세요!

    if (!window.google || !google.accounts) {
      showToast('구글 로그인 스크립트가 로드되지 않았습니다.', 'error');
      return;
    }

    if (CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com') {
      alert('실제 로그인을 작동시키려면 app.js 파일(136번째 줄 부근)에서 CLIENT_ID 값을 발급받은 실제 클라이언트 ID로 변경해야 합니다.');
      return;
    }

    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
      callback: async (response) => {
        if (response.access_token) {
          try {
            // 액세스 토큰으로 사용자 프로필 정보 가져오기
            const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${response.access_token}` }
            });
            const payload = await res.json();

            State.userInfo = { name: payload.name, picture: payload.picture, email: payload.email };
            localStorage.setItem('adgen_user_info', JSON.stringify(State.userInfo));

            document.getElementById('user-badge').classList.add('visible');
            document.getElementById('user-avatar').src = State.userInfo.picture;
            document.getElementById('user-name').textContent = State.userInfo.name;

            document.getElementById('setup-avatar').src = State.userInfo.picture;
            document.getElementById('setup-username').textContent = State.userInfo.email;
            showToast(`${payload.name}님, 환영합니다! 🎉`, 'success');

            setTimeout(() => {
              showScreen('screen-setup');
            }, 500);
          } catch (e) {
            console.error('User info fetch error', e);
            showToast('사용자 정보를 가져오는데 실패했습니다.', 'error');
          }
        }
      },
    });

    client.requestAccessToken();
  });

  document.getElementById('btn-start-guest').addEventListener('click', () => {
    showScreen('screen-setup');
  });
}

// ══════════════════════════════════════════
//  SCREEN 2: 설정
// ══════════════════════════════════════════
function initSetupScreen() {
  // 분위기 카드 선택
  document.querySelectorAll('.mood-card:not(.style-card)').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.mood-card:not(.style-card)').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      State.setupData.mood = card.dataset.mood;
      // 선택된 무드를 우측 상태 패널에도 즉시 반영
      const moodName = card.querySelector('.name').textContent;
      const statusMoodEl = document.getElementById('status-mood');
      if (statusMoodEl) statusMoodEl.textContent = moodName;
    });
  });

  // 화풍 카드 선택
  document.querySelectorAll('.style-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.style-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      State.setupData.style = card.dataset.style;
    });
  });

  // 사진 업로드
  const dropZone = document.getElementById('photo-drop-zone');
  const photoInput = document.getElementById('photo-input');

  dropZone.addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', e => handlePhotoFiles(Array.from(e.target.files)));

  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = 'var(--accent)'; });
  dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = ''; });
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.style.borderColor = '';
    handlePhotoFiles(Array.from(e.dataTransfer.files));
  });

  // 생성 버튼
  document.getElementById('btn-generate-bg').addEventListener('click', async () => {
    if (!State.setupData.mood) {
      showToast('먼저 원하시는 분위기(무드)를 하나 선택해 주세요!', 'error');
      return;
    }
    if (State.uploadedPhotos.length === 0) {
      showToast('제품 사진을 최소 1장 이상 업로드해 주세요!', 'error');
      return;
    }

    State.setupData.brand    = document.getElementById('s-brand').value.trim();
    State.setupData.address  = document.getElementById('s-address').value.trim();
    State.setupData.promo    = document.getElementById('s-promo').value.trim();
    State.setupData.category = document.getElementById('s-category').value;
    State.setupData.desc     = document.getElementById('s-desc').value.trim();

    const btn = document.getElementById('btn-generate-bg');
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> 일러스트 생성 중...';

    showLoading('🎨 제품을 일러스트로 재해석 중...\n(최대 40초 소요될 수 있습니다)');

    try {
      const form = new FormData();
      form.append('mood', State.setupData.mood);
      form.append('brand', State.setupData.brand);
      form.append('address', State.setupData.address);
      form.append('promo', State.setupData.promo);
      form.append('category', State.setupData.category);
      form.append('desc', State.setupData.desc);
      if (State.setupData.style) form.append('style', State.setupData.style);

      // 모든 업로드 사진을 한 번에 전송
      for (const photo of State.uploadedPhotos) {
        const fetchRes = await fetch(photo.dataUrl);
        const blob = await fetchRes.blob();
        form.append('images', blob, photo.name || 'product.jpg');
      }

      const res = await fetch('/v1/generate-illustration', {
        method: 'POST',
        body: form,
      });

      hideLoading();
      btn.disabled = false;
      btn.innerHTML = '<span>✨</span> 생성';

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast('생성 실패: ' + (err.detail || `서버 오류 ${res.status}`), 'error');
        return;
      }

      const data = await res.json();
      const illustUrl = data.illustration_url;
      if (!illustUrl) { showToast('일러스트 URL을 받지 못했습니다.', 'error'); return; }

      // 결과 일러스트를 캔버스 배경으로 바로 세팅 (조립 없음)
      await loadBackgroundImage(illustUrl);

      showScreen('screen-editor');
      fitZoom();
      updatePhotoPanel();
      updateLayerList();
      renderCanvas();
      showToast('🎨 일러스트 팜플렛 완성! 텍스트나 스티커를 추가해 마무리하세요.', 'success');

    } catch (e) {
      hideLoading();
      btn.disabled = false;
      btn.innerHTML = '<span>✨</span> 생성';
      showToast('생성 실패: ' + e.message, 'error');
    }
  });

  // 뒤로가기
  document.getElementById('btn-back-setup')?.addEventListener('click', () => {
    showScreen('screen-setup');
  });
}

// ══════════════════════════════════════════
//  SCREEN 3: 에디터
// ══════════════════════════════════════════
function initEditorScreen() {
  // 도구 버튼
  document.getElementById('btn-add-text-heading').addEventListener('click', () => {
    addLayer(createTextLayer('제목 텍스트', true));
    renderCanvas(); updateLayerList(); updateRightPanel();
    showToast('텍스트 추가됨 — 더블클릭하면 편집!');
  });
  document.getElementById('btn-add-text-body').addEventListener('click', () => {
    addLayer(createTextLayer('본문 텍스트를 입력하세요', false));
    renderCanvas(); updateLayerList(); updateRightPanel();
    showToast('텍스트 추가됨 — 더블클릭하면 편집!');
  });
  document.getElementById('btn-add-rect').addEventListener('click', () => {
    addLayer(createRectLayer()); renderCanvas(); updateLayerList(); updateRightPanel();
  });
  document.getElementById('btn-add-circle').addEventListener('click', () => {
    addLayer(createCircleLayer()); renderCanvas(); updateLayerList(); updateRightPanel();
  });
  document.getElementById('btn-add-line').addEventListener('click', () => {
    addLayer(createLineLayer()); renderCanvas(); updateLayerList(); updateRightPanel();
  });

  // 줌 버튼
  document.getElementById('btn-zoom-in').addEventListener('click', () => setZoom(State.zoom + 0.1));
  document.getElementById('btn-zoom-out').addEventListener('click', () => setZoom(State.zoom - 0.1));
  document.getElementById('btn-zoom-fit').addEventListener('click', fitZoom);

  // 실행취소/다시실행
  document.getElementById('btn-undo').addEventListener('click', () => {
    undo(); renderCanvas(); updateLayerList(); updateRightPanel();
  });
  document.getElementById('btn-redo').addEventListener('click', () => {
    redo(); renderCanvas(); updateLayerList(); updateRightPanel();
  });

  // 배경 재생성
  const regenHandler = async () => {
    const url = await generateBackground();
    if (url) { await loadBackgroundImage(url); showToast('배경이 재생성되었습니다!', 'success'); }
  };
  document.getElementById('btn-regen-top').addEventListener('click', regenHandler);
  document.getElementById('btn-regen-side').addEventListener('click', regenHandler);

  // 내보내기
  document.getElementById('btn-export').addEventListener('click', exportPNG);

  // 처음으로
  document.getElementById('btn-back-setup').addEventListener('click', () => {
    showScreen('screen-setup');
  });
}

// ══════════════════════════════════════════
//  APP 초기화
// ══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initCanvas();
  initEditor();
  initLeftPanel();
  initLoginScreen();
  initSetupScreen();
  initEditorScreen();

  // 초기 히스토리 저장
  saveHistory();

  // 윈도우 리사이즈 시 줌 재조정
  window.addEventListener('resize', () => {
    if (document.getElementById('screen-editor').classList.contains('active')) {
      fitZoom();
    }
  });
});
