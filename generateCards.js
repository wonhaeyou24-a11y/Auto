const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// [1. Pretendard 폰트 단일 등록]
const FONT_PATH = path.join(__dirname, 'fonts', 'Pretendard-Bold.ttf');
let ACTIVE_FONT = 'sans-serif';

if (fs.existsSync(FONT_PATH) && fs.statSync(FONT_PATH).size > 100000) {
  try {
    registerFont(FONT_PATH, { family: 'Pretendard', weight: 'bold' });
    ACTIVE_FONT = 'Pretendard';
  } catch (e) {
    console.warn('⚠️ 폰트 등록 실패, 기본 sans-serif 폰트를 사용합니다.');
  }
}

const WIDTH = 1080;
const HEIGHT = 1080;
const SAFE = 80;
const CONTENT_WIDTH = WIDTH - SAFE * 2;
const BRAND_HANDLE = '@my_instastudio';

const LAYOUTS = {
  modern: { label: '01 모던', description: '배경 사진 + 대형 후킹 제목 + 포인트 바' },
  editorial: { label: '02 에디토리얼', description: '매거진형 대형 번호/제목 배치 + 다크 글래스' },
  split: { label: '03 스플릿', description: '좌측 컬러 패널 + 우측 대형 콘텐츠' },
  card: { label: '04 카드', description: '사진 배경 위 대형 플로팅 카드 레이아웃' },
  minimal: { label: '05 미니멀', description: '여백과 가독성 중심의 깔끔한 구성' }
};

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// 한글 글자 단위 정밀 자동 줄바꿈
function getLines(ctx, text, maxWidth) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const paragraphs = normalized.split('\n');
  const lines = [];

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push('');
      continue;
    }

    const chars = Array.from(paragraph);
    let line = '';

    for (const char of chars) {
      const test = line + char;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line.trimEnd());
        line = char;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line.trimEnd());
  }

  return lines;
}

// 텍스트 블록 렌더링 (Node canvas 단일 폰트 파싱 보장)
function drawTextBlock(ctx, text, options = {}) {
  const {
    x,
    y,
    width,
    fontSize = 48,
    fontWeight = 'bold',
    lineHeightRatio = 1.35,
    color = '#ffffff',
    align = 'left',
    shadow = true
  } = options;

  const safeText = normalizeText(text);
  if (!safeText) return;

  ctx.save();
  // canvas 라이브러리 전용 단일 폰트 포맷 강제
  ctx.font = `${fontWeight} ${fontSize}px ${ACTIVE_FONT}`;
  const lines = getLines(ctx, safeText, width);
  const lineHeight = Math.round(fontSize * lineHeightRatio);

  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';

  if (shadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
  }

  for (let i = 0; i < lines.length; i++) {
    let drawX = x;
    if (align === 'center') drawX = x + width / 2;
    if (align === 'right') drawX = x + width;

    ctx.fillText(lines[i], drawX, y + i * lineHeight);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

async function drawBackgroundImage(ctx, imageUrl) {
  if (!imageUrl) return false;
  try {
    let imgBuffer;
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 5000 });
      imgBuffer = Buffer.from(response.data);
    } else {
      const localPath = path.join(__dirname, 'public', imageUrl);
      if (fs.existsSync(localPath)) {
        imgBuffer = fs.readFileSync(localPath);
      }
    }

    if (!imgBuffer) return false;
    const img = await loadImage(imgBuffer);

    const hRatio = WIDTH / img.width;
    const vRatio = HEIGHT / img.height;
    const ratio = Math.max(hRatio, vRatio);
    const centerShiftX = (WIDTH - img.width * ratio) / 2;
    const centerShiftY = (HEIGHT - img.height * ratio) / 2;

    ctx.drawImage(img, 0, 0, img.width, img.height, centerShiftX, centerShiftY, img.width * ratio, img.height * ratio);
    return true;
  } catch (err) {
    return false;
  }
}

async function drawBackground(ctx, layout, index, imageUrl) {
  const hasImage = await drawBackgroundImage(ctx, imageUrl);

  if (!hasImage) {
    const palettes = {
      modern: ['#0f172a', '#1e293b'],
      editorial: ['#1e293b', '#0f172a'],
      split: ['#111827', '#1f2937'],
      card: ['#1e1b4b', '#312e81'],
      minimal: ['#18181b', '#27272a']
    };
    const [a, b] = palettes[layout] || palettes.modern;
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, a);
    gradient.addColorStop(1, b);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // 선명한 가독성 오버레이 (Dark 75~90%)
  const overlay = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  overlay.addColorStop(0, 'rgba(15, 23, 42, 0.70)');
  overlay.addColorStop(0.5, 'rgba(15, 23, 42, 0.82)');
  overlay.addColorStop(1, 'rgba(15, 23, 42, 0.94)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawDecorations(ctx, index, total) {
  // 상단 슬라이드 인디케이터
  ctx.fillStyle = '#cbd5e1';
  ctx.font = `bold 30px ${ACTIVE_FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(`${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, WIDTH - SAFE, SAFE - 10);

  // 하단 브랜드 계정명
  ctx.textAlign = 'center';
  ctx.font = `bold 26px ${ACTIVE_FONT}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillText(BRAND_HANDLE, WIDTH / 2, HEIGHT - SAFE + 30);
}

// 01 MODERN
function drawModern(ctx, slide, index, total) {
  const accent = '#f43f5e';
  drawDecorations(ctx, index, total);

  ctx.fillStyle = accent;
  ctx.fillRect(SAFE, 150, 160, 12);

  if (slide.type === 'cover') {
    ctx.fillStyle = accent;
    ctx.font = `bold 36px ${ACTIVE_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('HOT ISSUE', SAFE, 190);

    drawTextBlock(ctx, slide.title, {
      x: SAFE,
      y: 280,
      width: CONTENT_WIDTH,
      fontSize: 76,
      fontWeight: 'bold',
      lineHeightRatio: 1.25,
      color: '#ffffff'
    });

    drawTextBlock(ctx, slide.subtitle, {
      x: SAFE,
      y: 720,
      width: CONTENT_WIDTH,
      fontSize: 38,
      fontWeight: 'bold',
      color: '#e2e8f0'
    });
  } else if (slide.type === 'body') {
    ctx.fillStyle = accent;
    ctx.font = `bold 42px ${ACTIVE_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`STEP ${slide.step || String(index).padStart(2, '0')}`, SAFE, 190);

    drawTextBlock(ctx, slide.title, {
      x: SAFE,
      y: 280,
      width: CONTENT_WIDTH,
      fontSize: 66,
      fontWeight: 'bold',
      lineHeightRatio: 1.25,
      color: '#ffffff'
    });

    drawTextBlock(ctx, slide.content, {
      x: SAFE,
      y: 540,
      width: CONTENT_WIDTH,
      fontSize: 44,
      fontWeight: 'bold',
      lineHeightRatio: 1.5,
      color: '#f8fafc'
    });
  } else {
    ctx.fillStyle = accent;
    ctx.font = `bold 38px ${ACTIVE_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('SAVE THIS', WIDTH / 2, 210);

    drawTextBlock(ctx, slide.title || '저장해두고 필요할 때 꺼내보세요!', {
      x: SAFE,
      y: 320,
      width: CONTENT_WIDTH,
      fontSize: 72,
      fontWeight: 'bold',
      lineHeightRatio: 1.3,
      color: '#ffffff',
      align: 'center'
    });

    drawTextBlock(ctx, slide.subtitle, {
      x: SAFE,
      y: 720,
      width: CONTENT_WIDTH,
      fontSize: 40,
      fontWeight: 'bold',
      color: '#cbd5e1',
      align: 'center'
    });
  }
}

// 02 EDITORIAL
function drawEditorial(ctx, slide, index, total) {
  drawDecorations(ctx, index, total);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(SAFE, 150, 10, 780);

  const innerX = SAFE + 48;
  const innerW = CONTENT_WIDTH - 48;

  if (slide.type === 'cover') {
    ctx.fillStyle = '#f59e0b';
    ctx.font = `bold 36px ${ACTIVE_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('INSIGHT / FEATURE', innerX, 170);

    drawTextBlock(ctx, slide.title, {
      x: innerX,
      y: 270,
      width: innerW,
      fontSize: 76,
      fontWeight: 'bold',
      lineHeightRatio: 1.25,
      color: '#ffffff'
    });

    drawTextBlock(ctx, slide.subtitle, {
      x: innerX,
      y: 720,
      width: innerW,
      fontSize: 38,
      fontWeight: 'bold',
      color: '#cbd5e1'
    });
  } else if (slide.type === 'body') {
    ctx.fillStyle = '#f59e0b';
    ctx.font = `bold 110px ${ACTIVE_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(slide.step || String(index).padStart(2, '0'), innerX, 150);

    drawTextBlock(ctx, slide.title, {
      x: innerX,
      y: 310,
      width: innerW,
      fontSize: 66,
      fontWeight: 'bold',
      lineHeightRatio: 1.25,
      color: '#ffffff'
    });

    drawTextBlock(ctx, slide.content, {
      x: innerX,
      y: 550,
      width: innerW,
      fontSize: 44,
      fontWeight: 'bold',
      lineHeightRatio: 1.5,
      color: '#f8fafc'
    });
  } else {
    ctx.fillStyle = '#f59e0b';
    ctx.font = `bold 38px ${ACTIVE_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('END NOTE', innerX, 210);

    drawTextBlock(ctx, slide.title, {
      x: innerX,
      y: 320,
      width: innerW,
      fontSize: 70,
      fontWeight: 'bold',
      lineHeightRatio: 1.3,
      color: '#ffffff'
    });

    drawTextBlock(ctx, slide.subtitle, {
      x: innerX,
      y: 720,
      width: innerW,
      fontSize: 38,
      fontWeight: 'bold',
      color: '#cbd5e1'
    });
  }
}

// 03 SPLIT
function drawSplit(ctx, slide, index, total) {
  const panelWidth = 340;
  ctx.fillStyle = '#4f46e5';
  ctx.fillRect(0, 0, panelWidth, HEIGHT);

  drawDecorations(ctx, index, total);

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 38px ${ACTIVE_FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(String(index + 1).padStart(2, '0'), SAFE, 150);

  const rightX = 390;
  const rightW = WIDTH - rightX - SAFE;

  if (slide.type === 'cover') {
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 34px ${ACTIVE_FONT}`;
    ctx.fillText('FEATURE', SAFE, 220);

    drawTextBlock(ctx, slide.title, {
      x: rightX,
      y: 250,
      width: rightW,
      fontSize: 70,
      fontWeight: 'bold',
      lineHeightRatio: 1.25,
      color: '#ffffff'
    });

    drawTextBlock(ctx, slide.subtitle, {
      x: rightX,
      y: 720,
      width: rightW,
      fontSize: 36,
      fontWeight: 'bold',
      color: '#e2e8f0'
    });
  } else if (slide.type === 'body') {
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 68px ${ACTIVE_FONT}`;
    ctx.fillText(slide.step || String(index).padStart(2, '0'), SAFE, 220);

    drawTextBlock(ctx, slide.title, {
      x: rightX,
      y: 250,
      width: rightW,
      fontSize: 60,
      fontWeight: 'bold',
      lineHeightRatio: 1.25,
      color: '#ffffff'
    });

    drawTextBlock(ctx, slide.content, {
      x: rightX,
      y: 530,
      width: rightW,
      fontSize: 40,
      fontWeight: 'bold',
      lineHeightRatio: 1.5,
      color: '#f8fafc'
    });
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 34px ${ACTIVE_FONT}`;
    ctx.fillText('SAVE', SAFE, 220);

    drawTextBlock(ctx, slide.title, {
      x: rightX,
      y: 300,
      width: rightW,
      fontSize: 64,
      fontWeight: 'bold',
      lineHeightRatio: 1.3,
      color: '#ffffff'
    });

    drawTextBlock(ctx, slide.subtitle, {
      x: rightX,
      y: 720,
      width: rightW,
      fontSize: 36,
      fontWeight: 'bold',
      color: '#e2e8f0'
    });
  }
}

// 04 CARD
function drawCard(ctx, slide, index, total) {
  drawDecorations(ctx, index, total);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  roundRect(ctx, SAFE, 140, CONTENT_WIDTH, 800, 36);
  ctx.fill();

  const innerX = SAFE + 50;
  const innerW = CONTENT_WIDTH - 100;

  if (slide.type === 'cover') {
    ctx.fillStyle = '#f97316';
    roundRect(ctx, innerX, 200, 180, 52, 26);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 28px ${ACTIVE_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('TREND', innerX + 90, 212);

    drawTextBlock(ctx, slide.title, {
      x: innerX,
      y: 300,
      width: innerW,
      fontSize: 72,
      fontWeight: 'bold',
      lineHeightRatio: 1.25,
      color: '#0f172a',
      shadow: false
    });

    drawTextBlock(ctx, slide.subtitle, {
      x: innerX,
      y: 720,
      width: innerW,
      fontSize: 38,
      fontWeight: 'bold',
      color: '#475569',
      shadow: false
    });
  } else if (slide.type === 'body') {
    ctx.fillStyle = '#f97316';
    ctx.font = `bold 56px ${ACTIVE_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(slide.step || String(index).padStart(2, '0'), innerX, 190);

    drawTextBlock(ctx, slide.title, {
      x: innerX,
      y: 280,
      width: innerW,
      fontSize: 62,
      fontWeight: 'bold',
      lineHeightRatio: 1.25,
      color: '#0f172a',
      shadow: false
    });

    ctx.fillStyle = '#f1f5f9';
    roundRect(ctx, innerX, 500, innerW, 370, 24);
    ctx.fill();

    drawTextBlock(ctx, slide.content, {
      x: innerX + 30,
      y: 540,
      width: innerW - 60,
      fontSize: 42,
      fontWeight: 'bold',
      lineHeightRatio: 1.5,
      color: '#1e293b',
      shadow: false
    });
  } else {
    ctx.fillStyle = '#f97316';
    ctx.font = `bold 34px ${ACTIVE_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('SAVE & SHARE', WIDTH / 2, 210);

    drawTextBlock(ctx, slide.title, {
      x: innerX,
      y: 310,
      width: innerW,
      fontSize: 66,
      fontWeight: 'bold',
      lineHeightRatio: 1.3,
      color: '#0f172a',
      align: 'center',
      shadow: false
    });

    drawTextBlock(ctx, slide.subtitle, {
      x: innerX,
      y: 720,
      width: innerW,
      fontSize: 36,
      fontWeight: 'bold',
      color: '#475569',
      align: 'center',
      shadow: false
    });
  }
}

// 05 MINIMAL
function drawMinimal(ctx, slide, index, total) {
  drawDecorations(ctx, index, total);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(SAFE, 150, 100, 8);

  if (slide.type === 'cover') {
    ctx.fillStyle = '#38bdf8';
    ctx.font = `bold 36px ${ACTIVE_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('INSIGHT', SAFE, 190);

    drawTextBlock(ctx, slide.title, {
      x: SAFE,
      y: 280,
      width: CONTENT_WIDTH,
      fontSize: 78,
      fontWeight: 'bold',
      lineHeightRatio: 1.25,
      color: '#ffffff'
    });

    drawTextBlock(ctx, slide.subtitle, {
      x: SAFE,
      y: 720,
      width: CONTENT_WIDTH,
      fontSize: 38,
      fontWeight: 'bold',
      color: '#cbd5e1'
    });
  } else if (slide.type === 'body') {
    ctx.fillStyle = '#38bdf8';
    ctx.font = `bold 40px ${ACTIVE_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`POINT ${slide.step || String(index).padStart(2, '0')}`, SAFE, 190);

    drawTextBlock(ctx, slide.title, {
      x: SAFE,
      y: 280,
      width: CONTENT_WIDTH,
      fontSize: 66,
      fontWeight: 'bold',
      lineHeightRatio: 1.25,
      color: '#ffffff'
    });

    drawTextBlock(ctx, slide.content, {
      x: SAFE,
      y: 540,
      width: CONTENT_WIDTH,
      fontSize: 44,
      fontWeight: 'bold',
      lineHeightRatio: 1.5,
      color: '#e2e8f0'
    });
  } else {
    ctx.fillStyle = '#38bdf8';
    ctx.font = `bold 38px ${ACTIVE_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('BOOKMARK', SAFE, 210);

    drawTextBlock(ctx, slide.title, {
      x: SAFE,
      y: 320,
      width: CONTENT_WIDTH,
      fontSize: 70,
      fontWeight: 'bold',
      lineHeightRatio: 1.3,
      color: '#ffffff'
    });

    drawTextBlock(ctx, slide.subtitle, {
      x: SAFE,
      y: 720,
      width: CONTENT_WIDTH,
      fontSize: 38,
      fontWeight: 'bold',
      color: '#cbd5e1'
    });
  }
}

async function renderSlide(slide = {}, index, totalSlides, options = {}) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const layout = LAYOUTS[options.layout] ? options.layout : 'modern';

  ctx.imageSmoothingEnabled = true;
  await drawBackground(ctx, layout, index, slide.imageUrl);

  if (layout === 'modern') drawModern(ctx, slide, index, totalSlides);
  else if (layout === 'editorial') drawEditorial(ctx, slide, index, totalSlides);
  else if (layout === 'split') drawSplit(ctx, slide, index, totalSlides);
  else if (layout === 'card') drawCard(ctx, slide, index, totalSlides);
  else drawMinimal(ctx, slide, index, totalSlides);

  const outputDir = path.join(__dirname, 'public', 'generated');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const fileName = `slide_${Date.now()}_${index + 1}_${Math.random().toString(36).slice(2, 6)}.png`;
  const filePath = path.join(outputDir, fileName);

  fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
  return `/generated/${fileName}`;
}

async function generateCarouselImages(slides = [], options = {}) {
  const safeSlides = Array.isArray(slides) ? slides : [];
  const renderPromises = safeSlides.map((slide, i) =>
    renderSlide(slide, i, safeSlides.length, options)
  );
  return await Promise.all(renderPromises);
}

module.exports = {
  generateCarouselImages,
  renderSlide,
  LAYOUTS,
  CANVAS_WIDTH: WIDTH,
  CANVAS_HEIGHT: HEIGHT,
  SAFE_AREA: SAFE
};