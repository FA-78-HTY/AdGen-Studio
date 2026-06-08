// ══════════════════════════════════════════
//  EDITOR — 드래그, 리사이즈, 텍스트 편집
// ══════════════════════════════════════════

let dragState = null;
// dragState = { type: 'move'|'resize', layerId, handle, startX, startY,
//               origX, origY, origW, origH }

function initEditor() {
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseUp);
  canvas.addEventListener('dblclick', onDblClick);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('keydown', onKeyDown);
}

// ── 마우스 다운 ──
function onMouseDown(e) {
  const { x, y } = canvasPoint(e);

  // 1) 선택된 레이어 핸들 체크
  if (State.selectedLayerId) {
    const sel = getLayer(State.selectedLayerId);
    if (sel) {
      const handle = hitHandle(sel, x, y);
      if (handle) {
        dragState = {
          type: 'resize', layerId: sel.id, handle,
          startX: x, startY: y,
          origX: sel.x, origY: sel.y,
          origW: sel.width, origH: sel.height,
        };
        return;
      }
    }
  }

  // 2) 레이어 선택 (역순 - 맨 위 레이어 우선)
  let hit = null;
  for (let i = State.layers.length - 1; i >= 0; i--) {
    if (hitTest(State.layers[i], x, y)) { hit = State.layers[i]; break; }
  }

  if (hit) {
    State.selectedLayerId = hit.id;
    dragState = {
      type: 'move', layerId: hit.id,
      startX: x, startY: y,
      origX: hit.x, origY: hit.y,
      origW: hit.width, origH: hit.height,
    };
    updateRightPanel();
    updateLayerList();
    renderCanvas();
  } else {
    State.selectedLayerId = null;
    updateRightPanel();
    updateLayerList();
    renderCanvas();
  }
}

// ── 마우스 이동 ──
function onMouseMove(e) {
  if (!dragState) {
    updateCursor(e);
    return;
  }

  const { x, y } = canvasPoint(e);
  const dx = x - dragState.startX;
  const dy = y - dragState.startY;
  const layer = getLayer(dragState.layerId);
  if (!layer) return;

  if (dragState.type === 'move') {
    layer.x = Math.round(dragState.origX + dx);
    layer.y = Math.round(dragState.origY + dy);
  } else if (dragState.type === 'resize') {
    applyResize(layer, dragState, dx, dy);
  }

  renderCanvas();
  updateRightPanel();
}

function applyResize(layer, ds, dx, dy) {
  const { handle, origX, origY, origW, origH } = ds;
  const MIN = 20;

  switch (handle) {
    case 'br':
      layer.width  = Math.max(MIN, origW + dx);
      layer.height = Math.max(MIN, origH + dy);
      break;
    case 'bl':
      layer.width  = Math.max(MIN, origW - dx);
      layer.x      = origX + origW - layer.width;
      layer.height = Math.max(MIN, origH + dy);
      break;
    case 'tr':
      layer.width  = Math.max(MIN, origW + dx);
      layer.height = Math.max(MIN, origH - dy);
      layer.y      = origY + origH - layer.height;
      break;
    case 'tl':
      layer.width  = Math.max(MIN, origW - dx);
      layer.x      = origX + origW - layer.width;
      layer.height = Math.max(MIN, origH - dy);
      layer.y      = origY + origH - layer.height;
      break;
    case 'mr':
      layer.width  = Math.max(MIN, origW + dx);
      break;
    case 'ml':
      layer.width  = Math.max(MIN, origW - dx);
      layer.x      = origX + origW - layer.width;
      break;
    case 'bm':
      layer.height = Math.max(MIN, origH + dy);
      break;
    case 'tm':
      layer.height = Math.max(MIN, origH - dy);
      layer.y      = origY + origH - layer.height;
      break;
  }
}

// ── 마우스 업 ──
function onMouseUp() {
  if (dragState) {
    saveHistory();
    dragState = null;
  }
}

// ── 커서 변경 ──
const RESIZE_CURSORS = {
  tl: 'nwse-resize', br: 'nwse-resize',
  tr: 'nesw-resize', bl: 'nesw-resize',
  tm: 'ns-resize',   bm: 'ns-resize',
  ml: 'ew-resize',   mr: 'ew-resize',
};

function updateCursor(e) {
  const { x, y } = canvasPoint(e);
  if (State.selectedLayerId) {
    const sel = getLayer(State.selectedLayerId);
    if (sel) {
      const h = hitHandle(sel, x, y);
      if (h) { canvas.style.cursor = RESIZE_CURSORS[h] || 'default'; return; }
    }
  }
  for (let i = State.layers.length - 1; i >= 0; i--) {
    if (hitTest(State.layers[i], x, y)) { canvas.style.cursor = 'move'; return; }
  }
  canvas.style.cursor = 'default';
}

// ── 더블클릭 → 텍스트 레이어 인라인 편집 ──
function onDblClick(e) {
  const { x, y } = canvasPoint(e);
  for (let i = State.layers.length - 1; i >= 0; i--) {
    const layer = State.layers[i];
    if (layer.type === LayerType.TEXT && hitTest(layer, x, y)) {
      openTextEditor(layer);
      return;
    }
  }
}

function openTextEditor(layer) {
  const wrapper = document.getElementById('canvas-wrapper');
  const existing = document.getElementById('inline-text-editor');
  if (existing) existing.remove();

  const ta = document.createElement('textarea');
  ta.id = 'inline-text-editor';
  ta.value = layer.text;

  const scaleX = wrapper.getBoundingClientRect().width / CANVAS_W;
  const scaleY = wrapper.getBoundingClientRect().height / CANVAS_H;

  ta.style.cssText = `
    position:absolute;
    left:${layer.x * scaleX}px; top:${layer.y * scaleY}px;
    width:${layer.width * scaleX}px; height:${Math.max(layer.height, 60) * scaleY}px;
    font-size:${layer.fontSize * scaleX}px;
    font-weight:${layer.fontWeight};
    font-family:'${layer.fontFamily}',sans-serif;
    color:${layer.color};
    background:rgba(255,255,255,0.9);
    border:2px solid #ff7043;
    border-radius:4px;
    padding:4px;
    resize:none;
    z-index:100;
    line-height:${layer.lineHeight};
    outline:none;
    box-sizing:border-box;
  `;

  wrapper.appendChild(ta);
  ta.focus();
  ta.select();

  ta.addEventListener('input', () => {
    layer.text = ta.value;
    layer.name = ta.value.slice(0, 12);
    renderCanvas();
    updateLayerList();
  });

  ta.addEventListener('blur', () => {
    ta.remove();
    saveHistory();
    renderCanvas();
  });

  ta.addEventListener('keydown', e => {
    if (e.key === 'Escape') { ta.blur(); }
  });
}

// ── 키보드 단축키 ──
function onKeyDown(e) {
  // 인라인 에디터가 열려있으면 무시
  if (document.getElementById('inline-text-editor')) return;
  // 입력 필드에 포커스 중이면 무시
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;

  if (e.ctrlKey && e.key === 'z') { undo(); renderCanvas(); updateLayerList(); updateRightPanel(); }
  if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
    redo(); renderCanvas(); updateLayerList(); updateRightPanel();
  }

  if (!State.selectedLayerId) return;
  const layer = getLayer(State.selectedLayerId);
  if (!layer) return;

  const step = e.shiftKey ? 10 : 2;
  if (e.key === 'ArrowLeft')  { layer.x -= step; e.preventDefault(); }
  if (e.key === 'ArrowRight') { layer.x += step; e.preventDefault(); }
  if (e.key === 'ArrowUp')    { layer.y -= step; e.preventDefault(); }
  if (e.key === 'ArrowDown')  { layer.y += step; e.preventDefault(); }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    removeLayer(State.selectedLayerId);
    updateLayerList(); updateRightPanel();
  }

  renderCanvas();
  updateRightPanel();
}

// ── 줌 ──
function setZoom(z) {
  State.zoom = Math.max(0.2, Math.min(2.0, z));
  const wrapper = document.getElementById('canvas-wrapper');
  wrapper.style.transform = `scale(${State.zoom})`;
  wrapper.style.transformOrigin = 'center center';
  document.getElementById('zoom-label').textContent = Math.round(State.zoom * 100) + '%';
}

function fitZoom() {
  const area = document.getElementById('canvas-area');
  const pad = 48;
  const zx = (area.clientWidth - pad) / CANVAS_W;
  const zy = (area.clientHeight - pad) / CANVAS_H;
  setZoom(Math.min(zx, zy));
}
