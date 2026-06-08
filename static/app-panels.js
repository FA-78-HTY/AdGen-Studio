// ══════════════════════════════════════════
//  UI PANELS — 왼쪽/오른쪽 패널 + 레이어 목록
// ══════════════════════════════════════════

// ── 스티커 목록 ──
const STICKERS = [
  '⭐','🌟','💫','✨','🔥','❤️','💕','🎉','🎊','🎁',
  '🌸','🌺','🌻','🌈','☀️','🌙','💎','👑','🏆','🎯',
  '🍀','🌿','🦋','🐝','🎵','📍','💯','🎀','🛒','📣',
];

// ── 색상 팔레트 ──
const PALETTE = [
  '#ffffff','#000000','#f87171','#fb923c','#facc15','#4ade80',
  '#34d399','#38bdf8','#818cf8','#c084fc','#f472b6','#94a3b8',
  'rgba(255,255,255,0.8)','rgba(255,255,255,0.5)','rgba(0,0,0,0.7)','rgba(0,0,0,0.4)',
];

const FONTS = [
  'Noto Sans KR', 'sans-serif', 'serif', 'monospace', 'cursive',
];

// ── 왼쪽 패널 탭 전환 ──
function initLeftPanel() {
  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.querySelectorAll('.panel-content').forEach(c => c.style.display = 'none');
      document.getElementById('tab-' + target).style.display = 'block';
    });
  });

  // 스티커 그리드 채우기
  const grid = document.getElementById('sticker-grid');
  STICKERS.forEach(emoji => {
    const el = document.createElement('div');
    el.className = 'sticker-item';
    el.textContent = emoji;
    el.addEventListener('click', () => {
      addLayer(createStickerLayer(emoji));
      renderCanvas();
      updateLayerList();
      updateRightPanel();
      showToast('스티커 추가됨!');
    });
    grid.appendChild(el);
  });

  // 사진 패널 업로드 버튼
  document.getElementById('btn-upload-more').addEventListener('click', () => {
    document.getElementById('more-photo-input').click();
  });
  document.getElementById('more-photo-input').addEventListener('change', e => {
    handlePhotoFiles(Array.from(e.target.files));
  });
}

// ── 사진 패널 업데이트 ──
function updatePhotoPanel() {
  const list = document.getElementById('panel-photo-list');
  list.innerHTML = '';
  State.uploadedPhotos.forEach((photo, idx) => {
    const item = document.createElement('div');
    item.className = 'photo-list-item';
    item.innerHTML = `<img src="${photo.dataUrl}" alt="사진"><span>사진 ${idx + 1}</span>`;
    item.addEventListener('click', () => {
      const layer = createImageLayer(photo.dataUrl, `사진 ${idx + 1}`);
      // 이미지 크기 보정
      const img = new Image();
      img.onload = () => {
        const aspect = img.naturalWidth / img.naturalHeight;
        layer.width = 300;
        layer.height = Math.round(300 / aspect);
        layer.x = Math.round((CANVAS_W - layer.width) / 2);
        layer.y = Math.round((CANVAS_H - layer.height) / 2);
        addLayer(layer);
        renderCanvas();
        updateLayerList();
        updateRightPanel();
      };
      img.src = photo.dataUrl;
      showToast('사진이 캔버스에 추가되었습니다');
    });
    list.appendChild(item);
  });
}

// ── 레이어 목록 업데이트 ──
function updateLayerList() {
  const list = document.getElementById('layer-list');
  list.innerHTML = '';

  // 역순으로 표시 (위가 앞)
  const reversed = [...State.layers].reverse();
  reversed.forEach(layer => {
    const item = document.createElement('div');
    item.className = 'layer-item' + (layer.id === State.selectedLayerId ? ' selected' : '');
    const iconMap = {
      image: '🖼', text: '🔤', rect: '▬', circle: '⬤', line: '—', sticker: '⭐'
    };
    item.innerHTML = `
      <span class="layer-icon">${iconMap[layer.type] || '□'}</span>
      <span class="layer-name">${layer.name || layer.type}</span>
      <div class="layer-actions">
        <button class="layer-action-btn" data-action="up" data-id="${layer.id}" title="앞으로">↑</button>
        <button class="layer-action-btn" data-action="down" data-id="${layer.id}" title="뒤로">↓</button>
        <button class="layer-action-btn" data-action="del" data-id="${layer.id}" title="삭제">✕</button>
      </div>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.layer-actions')) return;
      State.selectedLayerId = layer.id;
      updateLayerList();
      updateRightPanel();
      renderCanvas();
    });
    list.querySelectorAll && list.appendChild(item);
    list.appendChild(item);
  });

  // 버튼 이벤트
  list.querySelectorAll('.layer-action-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const { action, id } = btn.dataset;
      if (action === 'up') moveLayerUp(id);
      else if (action === 'down') moveLayerDown(id);
      else if (action === 'del') removeLayer(id);
      updateLayerList();
      updateRightPanel();
      renderCanvas();
    });
  });
}

// ── 오른쪽 속성 패널 업데이트 ──
function updateRightPanel() {
  const body = document.getElementById('props-body');
  const title = document.getElementById('props-title');
  const layer = getSelectedLayer();

  if (!layer) {
    title.textContent = '속성';
    body.innerHTML = '<p style="font-size:12px;color:var(--text2);text-align:center;padding-top:30px">레이어를 선택하면<br>속성을 편집할 수 있습니다</p>';
    return;
  }

  const TYPE_LABELS = { image:'사진', text:'텍스트', rect:'사각형', circle:'원', line:'구분선', sticker:'스티커' };
  title.textContent = TYPE_LABELS[layer.type] + ' 속성';

  let html = '';

  // 공통: 위치/크기
  html += `
    <div class="prop-group">
      <span class="prop-label">위치</span>
      <div class="prop-row">
        <input class="prop-input" type="number" id="prop-x" value="${Math.round(layer.x)}" style="width:48%">
        <input class="prop-input" type="number" id="prop-y" value="${Math.round(layer.y)}" style="width:48%">
      </div>
    </div>
    <div class="prop-group">
      <span class="prop-label">크기</span>
      <div class="prop-row">
        <input class="prop-input" type="number" id="prop-w" value="${Math.round(layer.width)}" style="width:48%">
        <input class="prop-input" type="number" id="prop-h" value="${Math.round(layer.height)}" style="width:48%">
      </div>
    </div>
    <div class="prop-group">
      <span class="prop-label">투명도 ${Math.round((layer.opacity ?? 1) * 100)}%</span>
      <input type="range" id="prop-opacity" min="0" max="1" step="0.01" value="${layer.opacity ?? 1}">
    </div>
    <div class="prop-group">
      <span class="prop-label">회전 ${layer.rotation ?? 0}°</span>
      <input type="range" id="prop-rotation" min="-180" max="180" step="1" value="${layer.rotation ?? 0}">
    </div>
  `;

  // 텍스트 전용
  if (layer.type === LayerType.TEXT) {
    html += `
      <div class="prop-group">
        <span class="prop-label">글자 크기</span>
        <input class="prop-input" type="number" id="prop-fontsize" value="${layer.fontSize}">
      </div>
      <div class="prop-group">
        <span class="prop-label">두께</span>
        <div class="prop-btn-row">
          <button class="prop-btn ${layer.fontWeight==='400'?'active':''}" data-weight="400">Regular</button>
          <button class="prop-btn ${layer.fontWeight==='700'?'active':''}" data-weight="700">Bold</button>
          <button class="prop-btn ${layer.fontWeight==='900'?'active':''}" data-weight="900">Black</button>
        </div>
      </div>
      <div class="prop-group">
        <span class="prop-label">정렬</span>
        <div class="prop-btn-row">
          <button class="prop-btn" data-align="left">←</button>
          <button class="prop-btn" data-align="center">↔</button>
          <button class="prop-btn" data-align="right">→</button>
        </div>
      </div>
      <div class="prop-group">
        <span class="prop-label">텍스트 색상</span>
        <div class="prop-row" style="align-items:center">
          <input type="color" id="prop-color" value="${layer.color.startsWith('#') ? layer.color : '#ffffff'}">
          <div class="color-swatch-row" style="flex:1">
            ${PALETTE.slice(0,8).map(c => `<div class="color-swatch" data-color="${c}" style="background:${c}" title="${c}"></div>`).join('')}
          </div>
        </div>
      </div>
      <div class="prop-group">
        <span class="prop-label">그림자 강도 ${layer.shadowBlur ?? 0}</span>
        <input type="range" id="prop-shadow" min="0" max="30" step="1" value="${layer.shadowBlur ?? 0}">
      </div>
    `;
  }

  // 이미지 전용
  if (layer.type === LayerType.IMAGE) {
    html += `
      <div class="prop-group">
        <span class="prop-label">모서리 둥글기 ${layer.borderRadius ?? 0}</span>
        <input type="range" id="prop-radius" min="0" max="200" step="1" value="${layer.borderRadius ?? 0}">
      </div>
      <div class="prop-group">
        <span class="prop-label">테두리 두께 ${layer.borderWidth ?? 0}</span>
        <input type="range" id="prop-border-w" min="0" max="20" step="1" value="${layer.borderWidth ?? 0}">
      </div>
      <div class="prop-group">
        <span class="prop-label">그림자 강도 ${layer.shadowBlur ?? 0}</span>
        <input type="range" id="prop-shadow" min="0" max="40" step="1" value="${layer.shadowBlur ?? 0}">
      </div>
    `;
  }

  // 도형 전용
  if ([LayerType.RECT, LayerType.CIRCLE, LayerType.LINE].includes(layer.type)) {
    html += `
      <div class="prop-group">
        <span class="prop-label">채우기 색상</span>
        <div class="prop-row" style="align-items:center">
          <input type="color" id="prop-fill" value="${(layer.fill || '#ffffff').replace(/rgba.*/,'#ffffff')}">
          <div class="color-swatch-row" style="flex:1">
            ${PALETTE.slice(0,8).map(c => `<div class="color-swatch" data-color="${c}" data-target="fill" style="background:${c}"></div>`).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // 삭제 버튼
  html += `
    <div class="prop-group" style="margin-top:16px">
      <button class="prop-btn danger" id="prop-delete">🗑 이 레이어 삭제</button>
    </div>
  `;

  body.innerHTML = html;
  bindPropEvents(layer);
}

function bindPropEvents(layer) {
  const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('input', fn); };
  const bindClick = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };

  bind('prop-x', e => { layer.x = +e.target.value; renderCanvas(); });
  bind('prop-y', e => { layer.y = +e.target.value; renderCanvas(); });
  bind('prop-w', e => { layer.width = +e.target.value; renderCanvas(); });
  bind('prop-h', e => { layer.height = +e.target.value; renderCanvas(); });
  bind('prop-opacity', e => {
    layer.opacity = +e.target.value;
    e.target.previousElementSibling.textContent = `투명도 ${Math.round(layer.opacity * 100)}%`;
    renderCanvas();
  });
  bind('prop-rotation', e => {
    layer.rotation = +e.target.value;
    e.target.previousElementSibling.textContent = `회전 ${layer.rotation}°`;
    renderCanvas();
  });

  if (layer.type === LayerType.TEXT) {
    bind('prop-fontsize', e => { layer.fontSize = +e.target.value; renderCanvas(); });
    bind('prop-color', e => { layer.color = e.target.value; renderCanvas(); });
    bind('prop-shadow', e => {
      layer.shadowBlur = +e.target.value;
      e.target.previousElementSibling.textContent = `그림자 강도 ${layer.shadowBlur}`;
      renderCanvas();
    });
    document.querySelectorAll('[data-weight]').forEach(btn => {
      btn.addEventListener('click', () => { layer.fontWeight = btn.dataset.weight; saveHistory(); renderCanvas(); updateRightPanel(); });
    });
    document.querySelectorAll('[data-align]').forEach(btn => {
      btn.addEventListener('click', () => { layer.align = btn.dataset.align; saveHistory(); renderCanvas(); });
    });
    document.querySelectorAll('.color-swatch:not([data-target])').forEach(sw => {
      sw.addEventListener('click', () => { layer.color = sw.dataset.color; saveHistory(); renderCanvas(); });
    });
  }

  if (layer.type === LayerType.IMAGE) {
    bind('prop-radius', e => {
      layer.borderRadius = +e.target.value;
      e.target.previousElementSibling.textContent = `모서리 둥글기 ${layer.borderRadius}`;
      renderCanvas();
    });
    bind('prop-border-w', e => {
      layer.borderWidth = +e.target.value;
      e.target.previousElementSibling.textContent = `테두리 두께 ${layer.borderWidth}`;
      renderCanvas();
    });
    bind('prop-shadow', e => {
      layer.shadowBlur = +e.target.value;
      e.target.previousElementSibling.textContent = `그림자 강도 ${layer.shadowBlur}`;
      renderCanvas();
    });
  }

  if ([LayerType.RECT, LayerType.CIRCLE, LayerType.LINE].includes(layer.type)) {
    bind('prop-fill', e => { layer.fill = e.target.value; renderCanvas(); });
    document.querySelectorAll('.color-swatch[data-target="fill"]').forEach(sw => {
      sw.addEventListener('click', () => { layer.fill = sw.dataset.color; saveHistory(); renderCanvas(); });
    });
  }

  bindClick('prop-delete', () => {
    removeLayer(layer.id);
    updateLayerList();
    updateRightPanel();
    renderCanvas();
    showToast('레이어가 삭제되었습니다');
  });
}
