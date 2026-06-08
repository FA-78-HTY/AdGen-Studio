// ══════════════════════════════════════════
//  CANVAS RENDERER — 레이어를 캔버스에 그리기
// ══════════════════════════════════════════
const CANVAS_W = 630;
const CANVAS_H = 900;

let canvas, ctx;

function initCanvas() {
  canvas = document.getElementById('main-canvas');
  ctx = canvas.getContext('2d');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
}

function renderCanvas() {
  if (!ctx) return;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // 1. 배경색
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // 2. 배경 이미지 (AI 생성)
  if (State.backgroundImage) {
    ctx.save();
    const imgW = State.backgroundImage.naturalWidth;
    const imgH = State.backgroundImage.naturalHeight;
    const imgRatio = imgW / imgH;
    const canvasRatio = CANVAS_W / CANVAS_H;
    
    let drawW = CANVAS_W;
    let drawH = CANVAS_H;
    let offsetX = 0;
    let offsetY = 0;

    if (imgRatio > canvasRatio) {
      // 이미지가 더 넓음 -> 높이를 맞추고 양옆을 자름 (cover)
      drawH = CANVAS_H;
      drawW = drawH * imgRatio;
      offsetX = (CANVAS_W - drawW) / 2;
    } else {
      // 이미지가 더 길음 -> 너비를 맞추고 위아래를 자름 (cover)
      drawW = CANVAS_W;
      drawH = drawW / imgRatio;
      offsetY = (CANVAS_H - drawH) / 2;
    }
    
    ctx.drawImage(State.backgroundImage, offsetX, offsetY, drawW, drawH);
    ctx.restore();
  }

  // 3. 레이어 렌더링 (인덱스 0이 맨 뒤)
  for (const layer of State.layers) {
    ctx.save();
    ctx.globalAlpha = layer.opacity ?? 1;

    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;
    if (layer.rotation) {
      ctx.translate(cx, cy);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    switch (layer.type) {
      case LayerType.IMAGE:   drawImageLayer(layer); break;
      case LayerType.TEXT:    drawTextLayer(layer); break;
      case LayerType.RECT:    drawRectLayer(layer); break;
      case LayerType.CIRCLE:  drawCircleLayer(layer); break;
      case LayerType.LINE:    drawLineLayer(layer); break;
      case LayerType.STICKER: drawStickerLayer(layer); break;
    }

    ctx.restore();
  }

  // 4. 선택된 레이어 핸들
  if (State.selectedLayerId) {
    const layer = getLayer(State.selectedLayerId);
    if (layer) drawSelectionHandles(layer);
  }
}

function drawImageLayer(layer) {
  if (!layer.img || !layer.img.complete || layer.img.naturalWidth === 0) {
    // 로딩 중 플레이스홀더
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
    return;
  }

  if (layer.shadowBlur > 0) {
    ctx.shadowBlur = layer.shadowBlur;
    ctx.shadowColor = layer.shadowColor || 'rgba(0,0,0,0.5)';
  }

  const r = layer.borderRadius || 0;
  if (r > 0) {
    ctx.save();
    ctx.beginPath();
    roundedRect(ctx, layer.x, layer.y, layer.width, layer.height, r);
    ctx.clip();
    ctx.drawImage(layer.img, layer.x, layer.y, layer.width, layer.height);
    ctx.restore();
  } else {
    ctx.drawImage(layer.img, layer.x, layer.y, layer.width, layer.height);
  }

  if (layer.borderWidth > 0) {
    ctx.strokeStyle = layer.borderColor || '#fff';
    ctx.lineWidth = layer.borderWidth;
    ctx.beginPath();
    if (r > 0) roundedRect(ctx, layer.x, layer.y, layer.width, layer.height, r);
    else ctx.rect(layer.x, layer.y, layer.width, layer.height);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

function drawTextLayer(layer) {
  const weight = layer.fontWeight || '400';
  const size = layer.fontSize || 28;
  const family = layer.fontFamily || 'Noto Sans KR';
  ctx.font = `${weight} ${size}px '${family}'`;
  ctx.fillStyle = layer.color || '#ffffff';
  ctx.textBaseline = 'top';
  ctx.textAlign = layer.align || 'left';

  if (layer.shadowBlur > 0) {
    ctx.shadowBlur = layer.shadowBlur;
    ctx.shadowColor = layer.shadowColor || 'rgba(0,0,0,0.5)';
  }

  const lineHeight = size * (layer.lineHeight || 1.3);
  const startX = layer.align === 'center'
    ? layer.x + layer.width / 2
    : layer.align === 'right' ? layer.x + layer.width : layer.x;

  // 자동 줄바꿈
  const words = layer.text.split('');
  let line = '';
  let currentY = layer.y;
  const maxW = layer.width;

  for (const ch of layer.text.split('\n').flatMap((row, i, arr) => i < arr.length - 1 ? [row, '\n'] : [row])) {
    if (ch === '\n') {
      ctx.fillText(line, startX, currentY);
      line = '';
      currentY += lineHeight;
      continue;
    }
    const testLine = line + ch;
    if (ctx.measureText(testLine).width > maxW && line) {
      ctx.fillText(line, startX, currentY);
      line = ch;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, startX, currentY);

  // 높이 자동 업데이트
  const lines = Math.max(1, Math.ceil((currentY + lineHeight - layer.y) / lineHeight));
  layer.height = lines * lineHeight + 10;

  ctx.shadowBlur = 0;
}

function drawRectLayer(layer) {
  const r = layer.borderRadius || 0;
  ctx.beginPath();
  if (r > 0) roundedRect(ctx, layer.x, layer.y, layer.width, layer.height, r);
  else ctx.rect(layer.x, layer.y, layer.width, layer.height);

  ctx.fillStyle = layer.fill || 'rgba(255,255,255,0.2)';
  ctx.fill();

  if ((layer.strokeWidth || 0) > 0) {
    ctx.strokeStyle = layer.stroke || '#ffffff';
    ctx.lineWidth = layer.strokeWidth;
    ctx.stroke();
  }
}

function drawCircleLayer(layer) {
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  const rx = layer.width / 2;
  const ry = layer.height / 2;

  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = layer.fill || 'rgba(255,255,255,0.15)';
  ctx.fill();
  if ((layer.strokeWidth || 0) > 0) {
    ctx.strokeStyle = layer.stroke || '#ffffff';
    ctx.lineWidth = layer.strokeWidth;
    ctx.stroke();
  }
}

function drawLineLayer(layer) {
  ctx.beginPath();
  ctx.moveTo(layer.x, layer.y + layer.height / 2);
  ctx.lineTo(layer.x + layer.width, layer.y + layer.height / 2);
  ctx.strokeStyle = layer.fill || 'rgba(255,255,255,0.5)';
  ctx.lineWidth = layer.height;
  ctx.stroke();
}

function drawStickerLayer(layer) {
  ctx.font = `${layer.width * 0.8}px serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(layer.emoji, layer.x + layer.width / 2, layer.y + layer.height / 2);
}

// 선택 핸들 그리기
const HANDLE_SIZE = 8;
const HANDLES = [
  { pos: 'tl', cx: 0,   cy: 0   },
  { pos: 'tm', cx: 0.5, cy: 0   },
  { pos: 'tr', cx: 1,   cy: 0   },
  { pos: 'ml', cx: 0,   cy: 0.5 },
  { pos: 'mr', cx: 1,   cy: 0.5 },
  { pos: 'bl', cx: 0,   cy: 1   },
  { pos: 'bm', cx: 0.5, cy: 1   },
  { pos: 'br', cx: 1,   cy: 1   },
];

function drawSelectionHandles(layer) {
  const { x, y, width, height } = layer;
  ctx.save();
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = '#ff7043';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - 1, y - 1, width + 2, height + 2);
  ctx.setLineDash([]);

  for (const h of HANDLES) {
    const hx = x + h.cx * width;
    const hy = y + h.cy * height;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#f4511e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(hx - HANDLE_SIZE / 2, hy - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// 유틸
function roundedRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 히트 테스트: 포인트가 레이어 위인지
function hitTest(layer, px, py) {
  return px >= layer.x && px <= layer.x + layer.width
      && py >= layer.y && py <= layer.y + layer.height;
}

// 핸들 히트 테스트
function hitHandle(layer, px, py) {
  for (const h of HANDLES) {
    const hx = layer.x + h.cx * layer.width;
    const hy = layer.y + h.cy * layer.height;
    if (Math.abs(px - hx) <= HANDLE_SIZE && Math.abs(py - hy) <= HANDLE_SIZE) {
      return h.pos;
    }
  }
  return null;
}

// 클릭 좌표 → 캔버스 좌표 변환
function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / State.zoom,
    y: (e.clientY - rect.top) / State.zoom,
  };
}
