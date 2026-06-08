// ══════════════════════════════════════════
//  STATE — 전체 앱 상태 관리
// ══════════════════════════════════════════
const State = {
  apiKey: '',
  userInfo: null,  // { name, picture, email }
  setupData: {
    brand: '', category: 'cafe', mood: '', desc: ''
  },
  uploadedPhotos: [],   // [{ id, dataUrl, name }]
  backgroundUrl: null,
  backgroundImage: null, // HTMLImageElement

  // 캔버스 레이어 목록 (위에 있을수록 앞에 렌더링)
  layers: [],
  selectedLayerId: null,
  zoom: 1.0,

  // 실행취소/다시실행 히스토리
  history: [],
  historyIndex: -1,
};

// ── 레이어 타입 상수 ──
const LayerType = {
  IMAGE: 'image',
  TEXT: 'text',
  RECT: 'rect',
  CIRCLE: 'circle',
  LINE: 'line',
  STICKER: 'sticker',
};

// ── 레이어 생성 헬퍼 ──
let _layerIdCounter = 0;
function makeId() { return 'layer_' + (++_layerIdCounter); }

function createImageLayer(dataUrl, name = '사진') {
  return {
    id: makeId(), type: LayerType.IMAGE,
    name, dataUrl, img: null,
    x: 80, y: 100, width: 300, height: 300,
    opacity: 1, rotation: 0,
    borderRadius: 0, borderWidth: 0, borderColor: '#ffffff',
    shadowBlur: 30, shadowColor: 'rgba(0,0,0,0.6)',
  };
}

function createTextLayer(text = '텍스트를 입력하세요', isHeading = false) {
  return {
    id: makeId(), type: LayerType.TEXT,
    name: text.slice(0, 12),
    text,
    x: 80, y: 200,
    width: 400, height: isHeading ? 90 : 50,
    fontSize: isHeading ? 68 : 34,
    fontFamily: 'Noto Sans KR',
    fontWeight: isHeading ? '900' : '500',
    color: '#ffffff',
    align: 'left',
    opacity: 1, rotation: 0,
    shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.8)',
    lineHeight: 1.2,
  };
}

function createRectLayer() {
  return {
    id: makeId(), type: LayerType.RECT,
    name: '사각형',
    x: 120, y: 200, width: 200, height: 80,
    fill: 'rgba(255,255,255,0.2)',
    stroke: '#ffffff', strokeWidth: 2,
    borderRadius: 12,
    opacity: 1, rotation: 0,
  };
}

function createCircleLayer() {
  return {
    id: makeId(), type: LayerType.CIRCLE,
    name: '원',
    x: 200, y: 250, width: 120, height: 120,
    fill: 'rgba(255,255,255,0.15)',
    stroke: '#ffffff', strokeWidth: 2,
    opacity: 1, rotation: 0,
  };
}

function createLineLayer() {
  return {
    id: makeId(), type: LayerType.LINE,
    name: '구분선',
    x: 40, y: 400, width: 550, height: 2,
    fill: 'rgba(255,255,255,0.5)',
    opacity: 1, rotation: 0,
  };
}

function createStickerLayer(emoji) {
  return {
    id: makeId(), type: LayerType.STICKER,
    name: emoji,
    emoji, x: 150, y: 150, width: 80, height: 80,
    opacity: 1, rotation: 0,
  };
}

// ── 히스토리 관리 ──
function saveHistory() {
  const snapshot = JSON.stringify(State.layers.map(l => {
    const copy = { ...l };
    delete copy.img;  // HTMLImageElement는 직렬화 불가
    return copy;
  }));
  State.history = State.history.slice(0, State.historyIndex + 1);
  State.history.push(snapshot);
  if (State.history.length > 50) State.history.shift();
  State.historyIndex = State.history.length - 1;
}

function undo() {
  if (State.historyIndex <= 0) return;
  State.historyIndex--;
  restoreHistory();
}

function redo() {
  if (State.historyIndex >= State.history.length - 1) return;
  State.historyIndex++;
  restoreHistory();
}

function restoreHistory() {
  const snap = JSON.parse(State.history[State.historyIndex]);
  State.layers = snap;
  // 이미지 레이어의 img 객체 복구
  State.layers.forEach(l => {
    if (l.type === LayerType.IMAGE && l.dataUrl) {
      const img = new Image();
      img.src = l.dataUrl;
      l.img = img;
    }
  });
  State.selectedLayerId = null;
}

// ── 레이어 CRUD ──
function addLayer(layer) {
  if (layer.type === LayerType.IMAGE) {
    const img = new Image();
    img.src = layer.dataUrl;
    img.onload = () => { layer.img = img; renderCanvas(); };
    layer.img = img;
  }
  State.layers.push(layer);
  State.selectedLayerId = layer.id;
  saveHistory();
}

function removeLayer(id) {
  State.layers = State.layers.filter(l => l.id !== id);
  if (State.selectedLayerId === id) State.selectedLayerId = null;
  saveHistory();
}

function getLayer(id) {
  return State.layers.find(l => l.id === id) || null;
}

function getSelectedLayer() {
  return getLayer(State.selectedLayerId);
}

function moveLayerUp(id) {
  const i = State.layers.findIndex(l => l.id === id);
  if (i < State.layers.length - 1) {
    [State.layers[i], State.layers[i+1]] = [State.layers[i+1], State.layers[i]];
    saveHistory();
  }
}

function moveLayerDown(id) {
  const i = State.layers.findIndex(l => l.id === id);
  if (i > 0) {
    [State.layers[i], State.layers[i-1]] = [State.layers[i-1], State.layers[i]];
    saveHistory();
  }
}
