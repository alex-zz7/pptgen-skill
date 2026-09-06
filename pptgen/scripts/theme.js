'use strict';
/**
 * pptgen theme engine — one deck, one world.
 *
 * Every slide comes from the same master frame (paper, stage backdrop, kicker tag,
 * footer rule, page badge). Content is laid out with a small page-type library
 * (cards / steps / compare / checklist / table / quote / interaction) that all
 * share palette, type scale and highlight color. Text stays editable; images
 * are a small kit (cover hero + 2–3 stage backdrops + spot illustrations), not
 * one unrelated painting per page.
 *
 * Usage (in a project build-ppt.js):
 *   const { createDeck } = require(path.join(process.env.PPTGEN_HOME
 *     || /* ~/.cursor|~/.claude|~/.agents /skills/pptgen */, 'scripts/theme.js'));
 *   const deck = createDeck({ ...see DEFAULTS... });
 *   deck.cover({...}); const s = deck.page({...}); deck.cards(s, [...]); deck.banner(s, '...');
 *   await deck.save('/abs/path.pptx');
 *
 * Keyword highlight markup inside any text: 【关键词】 → accent color + bold.
 * Animation tags: every object carries objectName 'stay' | 'fade:N' | 'rise:N' | 'wipe:N'
 * so {baseDir}/scripts/add-animations.py can choreograph clicks.
 */

const fs = require('fs');
const path = require('path');

// This file lives in the skill dir; pptxgenjs is installed in the project. Resolve from the caller.
function loadPptxgen() {
  const candidates = [process.cwd()];
  if (require.main && require.main.filename) candidates.push(path.dirname(require.main.filename));
  try {
    return require(require.resolve('pptxgenjs', { paths: candidates }));
  } catch (e) {
    return require('pptxgenjs');
  }
}
const pptxgen = loadPptxgen();

// sharp (from the project) for aspect-true image fitting. pptxgenjs `sizing:cover` does NOT
// write srcRect, so images get stretched; we pre-crop instead.
function loadSharp() {
  const candidates = [process.cwd()];
  if (require.main && require.main.filename) candidates.push(path.dirname(require.main.filename));
  try { return require(require.resolve('sharp', { paths: candidates })); } catch (e) { try { return require('sharp'); } catch (e2) { return null; } }
}
const sharpLib = loadSharp();
const os = require('os');
const crypto = require('crypto');
const FIT_DIR = path.join(os.tmpdir(), 'pptgen-fit');
const pendingFits = [];

/**
 * Return a path to a copy of imgPath center-cropped (or top-anchored) to boxW:boxH.
 * The crop runs async; save() awaits all crops before writing the pptx.
 */
function fitImage(imgPath, boxW, boxH, focus = 'centre') {
  if (!sharpLib || !exists(imgPath)) return imgPath;
  fs.mkdirSync(FIT_DIR, { recursive: true });
  const key = crypto.createHash('md5').update(`${imgPath}|${(boxW / boxH).toFixed(4)}|${focus}|${fs.statSync(imgPath).mtimeMs}|v2`).digest('hex').slice(0, 12);
  // opaque images are stored as JPEG (≈10× smaller pptx); images with alpha stay PNG
  let hasAlpha = false;
  try {
    const fd = fs.openSync(imgPath, 'r'); const head = Buffer.alloc(26); fs.readSync(fd, head, 0, 26, 0); fs.closeSync(fd);
    if (head.toString('ascii', 1, 4) === 'PNG') { const ct = head[25]; hasAlpha = ct === 4 || ct === 6; }
  } catch (e) { /* ignore */ }
  const ext = hasAlpha ? 'png' : 'jpg';
  const out = path.join(FIT_DIR, `${path.basename(imgPath, path.extname(imgPath))}-${key}.${ext}`);
  if (!fs.existsSync(out)) {
    const job = (async () => {
      const img = sharpLib(imgPath);
      const meta = await img.metadata();
      const target = boxW / boxH;
      const cur = meta.width / meta.height;
      let left = 0, top = 0, width = meta.width, height = meta.height;
      if (Math.abs(cur - target) > 0.01) {
        if (cur > target) { width = Math.round(meta.height * target); left = Math.round((meta.width - width) / 2); }
        else { height = Math.round(meta.width / target); top = focus === 'top' ? 0 : Math.round((meta.height - height) / 2); }
      }
      // cap resolution: 2200px wide is plenty for a 13.33in slide
      const maxW = Math.min(width, Math.round(boxW * 165));
      let pipe = img.extract({ left, top, width, height });
      if (maxW < width) pipe = pipe.resize({ width: maxW });
      if (hasAlpha) await pipe.png().toFile(out); else await pipe.jpeg({ quality: 88, mozjpeg: true }).toFile(out);
    })();
    pendingFits.push(job);
  }
  return out;
}

const W = 13.333;
const H = 7.5;

const DEFAULTS = {
  title: '课件',
  kicker: '主题班会',          // top-left tag on every content page
  footer: '',                  // bottom-left small text (deck name); default = title
  total: 0,                    // page count for badge "03 / 26"; 0 = auto at save
  palette: {
    paper: 'F6EEDD',           // slide paper
    card: 'FFFBF3',            // card fill
    ink: '2B241E',             // body text
    title: '4A2C17',           // title text
    accent: 'C23A2B',          // highlight / kicker / banner
    accent2: '1F6B63',         // second accent (numbers, sub labels)
    muted: '6B5E52',           // captions
    line: 'D8C8A8',            // hairlines / card borders
    banner: 'C23A2B',          // bottom takeaway banner fill
    bannerText: 'FFFFFF',
  },
  fonts: {
    title: 'Source Han Sans SC Heavy', // 标题字（Heavy 族自身就是重量级，不再加粗）
    body: 'Source Han Sans SC',        // 正文字
    titleBold: false,                  // true only for families that have a real Bold face
  },
  type: {                      // type scale, pt
    h1: 40, h2: 32, lead: 18, cardTitle: 20, body: 17, small: 13, banner: 18, badge: 11,
  },
  assets: {
    cover: null,               // 16:9 hero image
    bg: null,                  // ONE 16:9 background shared by every content page (preferred)
    stages: {},                // legacy: { A: '/abs/stageA.png', B: ... } rotating backdrops
    mockup: null,              // classroom screen scene, used by mockup.py (not by this file)
  },
  skin: {
    titleHighlight: null,      // hex → 【关键词】 in titles gets a marker-pen highlight (poster look)
    cardStrip: true,           // colored strip on top of cards
    cardFill: null,            // override card fill (default palette.card)
    bannerStyle: 'pill',       // 'pill' | 'ribbon'
    kickerStyle: 'flag',       // 'flag' | 'pill'
    stickers: ['star', 'heart'], // decorative shapes sprinkled on content pages ([] to disable)
    coverAlign: 'left',        // 'left' | 'center' | 'right' — where the cover title block sits
    coverPlate: false,         // translucent plate behind cover title
    coverGlow: 'FFFFFF',       // soft glow behind the cover title for legibility (null to disable)
    coverBlockW: null,         // width of the cover title block (default 8.6 left/right, W-1.6 center)
    coverZoom: 1,              // zoom the cover art (>1) …
    coverShiftY: 0,            // … and push it down so people sit lower, freeing the title area
    coverBg: null,             // slide background color revealed by the shift
    coverTop: undefined,       // fixed top of the title block (inches); default = a bit above center
    coverSubBand: null,        // subtitle band fill (poster style); default palette.accent2
    coverSubText: null,        // subtitle text color on the band; default white
    coverChipsAlign: 'center', // 'center' | 'left' (left keeps chips clear of artwork on the right)
    spotRatio: 4 / 3,          // aspect of spot images inside cards
  },
  safe: { x: 0.9, y: 1.45, w: 11.5, h: 4.75 }, // text-safe zone inside backdrops
};

function deepMerge(a, b) {
  const out = { ...a };
  for (const k of Object.keys(b || {})) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') {
      out[k] = deepMerge(a[k], b[k]);
    } else if (b[k] !== undefined) {
      out[k] = b[k];
    }
  }
  return out;
}

const stay = () => ({ objectName: 'stay' });
const anim = (kind, n) => ({ objectName: `${kind}:${n}` });

/** 【关键词】 → runs with accent + bold (+ optional marker highlight). Plain string → single run. */
function runs(text, base, accent, highlight) {
  if (Array.isArray(text)) return text;
  const parts = String(text).split(/(【[^】]+】)/g).filter(Boolean);
  return parts.map((p) => {
    const m = p.match(/^【(.+)】$/);
    if (m) return { text: m[1], options: { ...base, color: accent, bold: true, ...(highlight ? { highlight } : {}) } };
    return { text: p, options: { ...base } };
  });
}

function exists(p) {
  return p && fs.existsSync(p);
}

function createDeck(userOpts) {
  const o = deepMerge(DEFAULTS, userOpts || {});
  const P = o.palette;
  const F = o.fonts;
  const T = o.type;
  const SK = o.skin;
  const footerText = o.footer || o.title;
  const cardFill = SK.cardFill || P.card;

  const pptx = new pptxgen();
  pptx.defineLayout({ name: 'WIDE16', width: W, height: H });
  pptx.layout = 'WIDE16';
  pptx.title = o.title;
  pptx.lang = 'zh-CN';

  // ---- master frames -------------------------------------------------------
  // One master per stage backdrop so every content slide shares the frame.
  const stageNames = Object.keys(o.assets.stages || {});
  const masters = [];
  const frameObjects = (stagePath) => {
    const objs = [];
    if (exists(stagePath)) {
      objs.push({ image: { x: 0, y: 0, w: W, h: H, path: fitImage(stagePath, W, H) } });
    }
    // kicker tag: filled flag so it reads on any backdrop
    const kw = Math.min(5.2, 0.5 + o.kicker.length * 0.19);
    const kf = SK.kickerFill || P.accent, kt = SK.kickerText || 'FFFFFF';
    objs.push({ rect: { x: 0.9, y: 0.38, w: kw, h: 0.4, fill: { color: kf }, line: { color: kf, width: 0 } } });
    objs.push({
      text: {
        text: o.kicker,
        options: { x: 0.9, y: 0.38, w: kw, h: 0.4, fontFace: F.body, fontSize: T.small + 1, color: kt, bold: true, margin: 0, align: 'center', valign: 'middle' },
      },
    });
    // bottom rule + footer chip
    objs.push({ line: { x: 0.9, y: 6.9, w: W - 1.8, h: 0, line: { color: P.line, width: 0.75 } } });
    objs.push({ rect: { x: 0.9, y: 6.96, w: Math.min(6, 0.4 + footerText.length * 0.16), h: 0.3, fill: { color: cardFill }, line: { color: P.line, width: 0.5 } } });
    objs.push({
      text: {
        text: footerText,
        options: { x: 0.9, y: 6.96, w: Math.min(6, 0.4 + footerText.length * 0.16), h: 0.3, fontFace: F.body, fontSize: T.small, color: P.muted, margin: 0, align: 'center', valign: 'middle' },
      },
    });
    return objs;
  };
  if (o.assets.bg && exists(o.assets.bg)) {
    // one background for the whole deck
    pptx.defineSlideMaster({ title: 'FRAME', background: { color: P.paper }, objects: frameObjects(o.assets.bg) });
    masters.push('FRAME');
  } else if (stageNames.length === 0) {
    pptx.defineSlideMaster({ title: 'FRAME', background: { color: P.paper }, objects: frameObjects(null) });
    masters.push('FRAME');
  } else {
    for (const n of stageNames) {
      pptx.defineSlideMaster({ title: `FRAME_${n}`, background: { color: P.paper }, objects: frameObjects(o.assets.stages[n]) });
      masters.push(`FRAME_${n}`);
    }
  }
  pptx.defineSlideMaster({ title: 'PLAIN', background: { color: P.paper }, objects: [] });

  const state = { pages: [], n: 0, badges: [] };

  // Badges are drawn at save() so the total is always right without a second pass.
  function badge(slide, n) {
    state.badges.push({ slide, n });
  }
  function drawBadge(slide, n, total) {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: W - 2.1, y: 6.94, w: 1.2, h: 0.34, rectRadius: 0.17,
      fill: { color: cardFill }, line: { color: P.line, width: 0.75 }, ...stay(),
    });
    slide.addText(`${String(n).padStart(2, '0')}  /  ${String(total).padStart(2, '0')}`, {
      x: W - 2.1, y: 6.94, w: 1.2, h: 0.34, fontFace: F.body, fontSize: T.badge, color: P.muted,
      align: 'center', valign: 'middle', margin: 0, objectName: 'stay-badge',
    });
  }

  function newSlide(masterName, role) {
    const s = pptx.addSlide({ masterName });
    state.n += 1;
    const rec = { n: state.n, role, units: 0, chars: 0, slide: s };
    state.pages.push(rec);
    s.__rec = rec;
    return s;
  }
  function count(slide, units, text) {
    const rec = slide.__rec;
    if (!rec) return;
    rec.units += units;
    rec.chars += String(Array.isArray(text) ? text.map((r) => r.text).join('') : text || '').replace(/【|】/g, '').length;
  }

  // ---- page roles ----------------------------------------------------------

  /**
   * Cover: hero image + title block. Position follows skin.coverAlign so the block sits in the
   * quiet area the cover art left open. tagline = small line above the title (「小岗位 · 大担当」).
   */
  function cover({ title, sub, tagline, chipLeft, chipRight, hero, plate = SK.coverPlate, titleColor, subColor, align = SK.coverAlign, glow = SK.coverGlow }) {
    const s = newSlide('PLAIN', 'cover');
    if (SK.coverBg) s.background = { color: SK.coverBg };
    const img = hero || o.assets.cover;
    if (exists(img)) {
      // optional zoom + downward shift so the artwork's people sit lower and the sky/paper is free for the title
      const z = SK.coverZoom || 1;
      const dy = SK.coverShiftY || 0;
      s.addImage({ path: fitImage(img, W, H), x: -(W * (z - 1)) / 2, y: dy, w: W * z, h: H * z, ...stay() });
    }
    const emOf = (t) => [...String(t).replace(/【|】/g, '')].reduce((a, ch) => a + (/[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.55), 0);
    // poster composition: title spans ~88% of the slide, centered (like the reference posters)
    const poster = align === 'center';
    const bw = SK.coverBlockW || (poster ? W - 1.6 : 8.6);
    const bx = align === 'left' ? 0.8 : align === 'right' ? W - 0.8 - bw : (W - bw) / 2;
    const ta = poster ? 'center' : 'left';
    const titleEm = emOf(title);
    const titleSize = Math.max(56, Math.min(poster ? 112 : 96, Math.floor((bw * 72) / (titleEm * 1.06))));
    const titleH = (titleSize * 1.22) / 72;
    const subLinesArr = sub ? String(sub).split('\n') : [];
    const subEm0 = sub ? Math.max(...subLinesArr.map(emOf)) : 1;
    const subSize = Math.max(18, Math.min(Math.round(titleSize * 0.28), Math.floor(((bw - 1.2) * 72) / (subEm0 * 1.04))));
    const tagSize = Math.max(18, Math.round(titleSize * 0.2));
    const tagH = tagline ? (tagSize * 1.7) / 72 : 0;
    const subH = sub ? (subLinesArr.length * subSize * 1.35 + 14) / 72 : 0;
    const chipH = 0.58;
    const blockH = tagH + titleH + 0.12 + (sub ? subH + 0.22 : 0) + chipH;
    const y0 = SK.coverTop !== undefined ? SK.coverTop : Math.max(0.7, (H - blockH) / 2 - 0.55);
    if (plate) {
      s.addShape(pptx.ShapeType.roundRect, { x: bx - 0.35, y: y0 - 0.3, w: bw + 0.7, h: blockH + 0.5, rectRadius: 0.22, fill: { color: cardFill, transparency: 12 }, line: { color: P.line, width: 1 }, ...stay() });
    }
    let y = y0;
    const tColor = titleColor || P.title;
    const sColor = subColor || P.muted;
    if (tagline) {
      const tagText = poster ? `— — —   ${tagline}   — — —` : tagline;
      s.addText(tagText, { x: bx, y, w: bw, h: tagH, fontFace: F.body, fontSize: tagSize, color: sColor, bold: true, align: ta, valign: 'middle', margin: 0, charSpacing: 3, ...anim('fade', 1) });
      y += tagH;
    }
    markerBar(s, title, bx, y, titleH, titleSize, SK.titleHighlight, anim('rise', 1), { align: ta, boxW: bw, totalEm: titleEm });
    const glowOpt = glow ? { glow: { size: 10, opacity: 0.6, color: glow } } : {};
    s.addText(runs(title, { fontFace: F.title, fontSize: titleSize, color: tColor, bold: F.titleBold, ...glowOpt }, SK.titleHighlight ? tColor : P.accent), {
      x: bx, y, w: bw, h: titleH, align: ta, valign: 'middle', margin: 0, ...anim('rise', 1),
    });
    y += titleH + 0.12;
    if (sub) {
      // subtitle band (poster) or plain line
      const bandW = Math.min(bw, (subEm0 * subSize) / 72 + 1.2);
      const bandX = poster ? bx + (bw - bandW) / 2 : bx;
      if (poster) {
        const bandFill = SK.coverSubBand || P.accent2;
        s.addShape(pptx.ShapeType.roundRect, { x: bandX, y, w: bandW, h: subH, rectRadius: Math.min(0.35, subH / 2), fill: { color: bandFill }, line: { color: bandFill }, ...anim('fade', 2) });
      }
      const subRuns = [];
      subLinesArr.forEach((ln, li) => {
        const rr = runs(ln, { fontFace: F.body, fontSize: subSize, color: poster ? (SK.coverSubText || 'FFFFFF') : sColor, bold: true }, poster ? (SK.coverSubText || 'FFFFFF') : P.accent);
        rr.forEach((r, ri) => { r.options.breakLine = li < subLinesArr.length - 1 && ri === rr.length - 1; });
        subRuns.push(...rr);
      });
      s.addText(subRuns, { x: bandX, y, w: bandW, h: subH, align: ta, valign: 'middle', margin: 0, lineSpacingMultiple: 1.2, ...anim('fade', 2) });
      y += subH + 0.22;
    }
    const chipFs = T.small + 3;
    const chipLw = chipLeft ? Math.min(3.6, 0.8 + chipLeft.length * 0.24) : 0;
    const chipRw = chipRight ? Math.min(4.0, 0.8 + chipRight.length * 0.24) : 0;
    let cx = poster && SK.coverChipsAlign !== 'left' ? bx + bw / 2 - (chipLw + (chipLeft && chipRight ? 0.3 : 0) + chipRw) / 2 : bx;
    if (chipLeft) {
      s.addShape(pptx.ShapeType.roundRect, { x: cx, y, w: chipLw, h: chipH, rectRadius: chipH / 2, fill: { color: P.accent }, line: { color: P.accent }, ...anim('fade', 2) });
      s.addText(chipLeft, { x: cx, y, w: chipLw, h: chipH, fontFace: F.body, fontSize: chipFs, color: 'FFFFFF', bold: true, align: 'center', valign: 'middle', margin: 0, ...anim('fade', 2) });
      cx += chipLw + 0.3;
    }
    if (chipRight) {
      s.addShape(pptx.ShapeType.roundRect, { x: cx, y, w: chipRw, h: chipH, rectRadius: chipH / 2, fill: { color: cardFill }, line: { color: P.accent2, width: 1.5 }, ...anim('fade', 2) });
      s.addText(chipRight, { x: cx, y, w: chipRw, h: chipH, fontFace: F.body, fontSize: chipFs, color: P.accent2, bold: true, align: 'center', valign: 'middle', margin: 0, ...anim('fade', 2) });
    }
    count(s, 1, title);
    return s;
  }

  /** Section divider: big number + title + one-line promise. */
  function section({ n, title, sub, stage, mascot: mascotPath }) {
    const master = stage && masters.includes(`FRAME_${stage}`) ? `FRAME_${stage}` : masters[0];
    const s = newSlide(master, 'section');
    s.addShape(pptx.ShapeType.roundRect, { x: 0.7, y: 1.45, w: W - 1.4, h: 2.7, rectRadius: 0.18, fill: { color: cardFill, transparency: 8 }, line: { color: P.line, width: 1 }, ...stay() });
    s.addText(String(n).padStart(2, '0'), { x: 0.9, y: 1.7, w: 3, h: 1.6, fontFace: F.title, fontSize: 88, color: P.accent, bold: F.titleBold, margin: 0, objectName: 'fade:1-section' });
    s.addText(runs(title, { fontFace: F.title, fontSize: T.h1 + 4, color: P.title, bold: F.titleBold }, P.accent), {
      x: 3.9, y: 1.85, w: mascotPath ? 5.0 : 8.4, h: 1.0, valign: 'middle', margin: 0, ...anim('rise', 1),
    });
    if (sub) {
      s.addText(runs(sub, { fontFace: F.body, fontSize: T.lead, color: P.ink }, P.accent), { x: 3.95, y: 2.95, w: mascotPath ? 5.0 : 8.3, h: 0.9, valign: 'top', margin: 0, ...anim('fade', 2) });
    }
    if (mascotPath) mascot(s, mascotPath, { x: W - 0.9 - 3.6, y: 1.55, w: 3.6, h: 2.5 }, 2);
    badge(s, state.n);
    count(s, 1, title);
    return s;
  }

  /**
   * Content page shell: two-tone title + optional lead sentence.
   * title: '学习永远是【第一身份】' or runs[]
   */
  function page({ title, lead, stage, kicker, plate = true }) {
    const master = stage && masters.includes(`FRAME_${stage}`) ? `FRAME_${stage}` : masters[0];
    const s = newSlide(master, 'content');
    if (kicker) {
      const kw = Math.min(5.2, 0.5 + kicker.length * 0.19);
      const kf = SK.kickerFill || P.accent, kt = SK.kickerText || 'FFFFFF';
      s.addShape(pptx.ShapeType.rect, { x: 0.9, y: 0.38, w: kw, h: 0.4, fill: { color: kf }, line: { color: kf, width: 0 }, ...stay() });
      s.addText(kicker, { x: 0.9, y: 0.38, w: kw, h: 0.4, fontFace: F.body, fontSize: T.small + 1, color: kt, bold: true, margin: 0, align: 'center', valign: 'middle', ...stay() });
    }
    if (plate) {
      // paper plate behind title + lead; near-invisible on light stages, protective on busy ones
      s.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 0.8, w: 11.7, h: lead ? 1.3 : 0.82, rectRadius: 0.12, fill: { color: cardFill, transparency: 12 }, line: { color: P.card, transparency: 100 }, ...stay() });
    }
    markerBar(s, title, 0.9, 0.85, 0.72, T.h2, SK.titleHighlight, stay());
    s.addText(runs(title, { fontFace: F.title, fontSize: T.h2, color: P.title, bold: F.titleBold }, SK.titleHighlight ? P.title : P.accent), {
      x: 0.9, y: 0.85, w: 11.5, h: 0.72, valign: 'middle', margin: 0, ...stay(), objectName: 'stay-title',
    });
    stickers(s);
    if (lead) {
      s.addText(runs(lead, { fontFace: F.body, fontSize: T.lead, color: P.ink }, P.accent), {
        x: 0.95, y: 1.55, w: 11.4, h: 0.5, valign: 'middle', margin: 0, ...anim('fade', 1),
      });
      count(s, 1, lead);
    }
    count(s, 0, title);
    badge(s, state.n);
    s.__contentTop = lead ? 2.15 : 1.65;
    return s;
  }

  function cardBox(slide, x, y, w, h, tag, opts = {}) {
    // soft drop shadow + card + optional colored strip on top
    slide.addShape(pptx.ShapeType.roundRect, { x: x + 0.04, y: y + 0.06, w, h, rectRadius: 0.14, fill: { color: '000000', transparency: 90 }, line: { color: '000000', transparency: 100 }, ...tag });
    slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.14, fill: { color: opts.fill || cardFill }, line: { color: P.line, width: 1 }, ...tag });
    if (SK.cardStrip && opts.strip !== false) {
      slide.addShape(pptx.ShapeType.roundRect, { x: x + 0.22, y: y - 0.04, w: Math.min(1.4, w * 0.4), h: 0.12, rectRadius: 0.06, fill: { color: opts.stripColor || P.accent2 }, line: { color: opts.stripColor || P.accent2 }, ...tag });
    }
  }

  const STICKER_SHAPES = { star: 'star5', heart: 'heart', cloud: 'cloud', sun: 'sun', moon: 'moon' };
  /** 2–3 small decorative shapes near the page corners (deterministic per page number). */
  function stickers(slide) {
    const kinds = SK.stickers || [];
    if (!kinds.length) return;
    const n = slide.__rec ? slide.__rec.n : 1;
    const spots = [
      { x: W - 1.55, y: 0.36, s: 0.34, rot: 15 },
      { x: 0.35, y: 3.9, s: 0.26, rot: -20 },
      { x: W - 0.62, y: 5.55, s: 0.28, rot: 30 },
    ];
    spots.forEach((sp, i) => {
      if ((n + i) % 2 === 1 && i === 1) return; // vary density page to page
      const kind = kinds[(n + i) % kinds.length];
      const shape = pptx.ShapeType[STICKER_SHAPES[kind] || 'star5'];
      const colors = [P.accent, P.accent2, SK.titleHighlight || P.accent];
      const c = colors[(n + i) % colors.length];
      slide.addShape(shape, { x: sp.x, y: sp.y, w: sp.s, h: sp.s, fill: { color: c, transparency: 15 }, line: { color: c, transparency: 100 }, rotate: sp.rot, ...stay() });
    });
  }

  /** Sticky-note aside (老师提示 / 例). Rotated pale note with a tape strip. */
  function note(slide, text, opts = {}) {
    const w = opts.w || 3.1, h = opts.h || 1.25;
    const x = opts.x !== undefined ? opts.x : W - 0.9 - w;
    const y = opts.y !== undefined ? opts.y : 5.0;
    const fill = opts.fill || 'FFF3B0';
    slide.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: fill }, line: { color: fill }, rotate: opts.rotate === undefined ? -2 : opts.rotate, shadow: { type: 'outer', blur: 4, offset: 2, angle: 45, color: '000000', opacity: 0.18 }, ...anim('fade', 8) });
    slide.addShape(pptx.ShapeType.rect, { x: x + w / 2 - 0.5, y: y - 0.1, w: 1.0, h: 0.22, fill: { color: 'FFFFFF', transparency: 45 }, line: { color: 'FFFFFF', transparency: 100 }, rotate: -6, ...anim('fade', 8) });
    slide.addText(runs(text, { fontFace: F.body, fontSize: T.small + 1, color: P.ink }, P.accent), { x: x + 0.15, y: y + 0.12, w: w - 0.3, h: h - 0.24, valign: 'middle', margin: 0, rotate: opts.rotate === undefined ? -2 : opts.rotate, ...anim('fade', 8) });
    count(slide, 1, text);
    return slide;
  }

  /**
   * Marker-pen bar behind the 【关键词】 of a left-aligned single-line title (poster look).
   * Keynote ignores run `highlight`, so we draw a shape. CJK glyph ≈ 1em wide.
   */
  function markerBar(slide, text, x, y, h, fontSize, color, tag, opts = {}) {
    if (!color || Array.isArray(text)) return;
    const m = String(text).match(/^([^【]*)【([^】]+)】/);
    if (!m) return;
    const em = fontSize / 72;
    const cw = (ch) => (/[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? em : em * 0.55);
    let start = [...m[1]].reduce((a, c) => a + cw(c), 0);
    if (opts.align === 'center' && opts.boxW && opts.totalEm) start += (opts.boxW - opts.totalEm * em) / 2;
    const width = [...m[2]].reduce((a, c) => a + cw(c), 0);
    const barH = em * 0.42;
    slide.addShape(pptx.ShapeType.roundRect, { x: x + start - 0.04, y: y + h / 2 + em * 0.12, w: width + 0.1, h: barH, rectRadius: 0.05, fill: { color, transparency: 15 }, line: { color, transparency: 100 }, ...tag });
  }

  /** Rough wrapped-line count for CJK text in a box of width w (inches) at fontSize pt. */
  function wrappedLines(lines, w, fontSize) {
    // CJK glyph ≈ 1em, ASCII/punctuation ≈ 0.55em; bullet indent is fixed at 14pt (see bullet options)
    const emPerLine = Math.max(4, ((w * 72) - 14) / fontSize - 0.3);
    const widthEm = (l) => [...String(l).replace(/【|】/g, '')].reduce((a, ch) => a + (/[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.55), 0);
    return (lines || []).reduce((n, l) => n + Math.max(1, Math.ceil(widthEm(l) / emPerLine)), 0);
  }
  const LS = 1.2;                                   // explicit line spacing multiple on body text (cross-platform)
  const PARA = 4;                                   // paragraph space after (pt)
  const LINE_H = (fontSize) => (fontSize * LS + PARA) / 72; // inches per wrapped line incl. paragraph spacing

  /**
   * N cards in a row (2–4). items: [{ n, title, lines:[...], spot:'/abs.png', note }]
   * Card height fits content (min 1.7") unless opts.h is given; opts.fill=true stretches to the banner.
   */
  function cards(slide, items, opts = {}) {
    const cols = opts.cols || items.length;
    const gap = 0.3;
    const x0 = o.safe.x;
    const top = opts.y || slide.__contentTop || 1.65;
    const bottom = opts.bannerAfter ? 6.05 : 6.6;
    const w = (o.safe.w - gap * (cols - 1)) / cols;
    const maxH = bottom - top;
    const fullSpotH = (w - 0.36) / SK.spotRatio;             // true-aspect image height
    const row = items.slice(0, cols);
    // choose one body size and one spot height for the whole row so cards stay uniform
    let fs = T.body;
    let spotH = row.some((it) => exists(it.spot)) ? fullSpotH : 0;
    const need = (f, sh) => row.map((it) => 0.14 + (exists(it.spot) ? sh + 0.12 : 0) + 0.52 + wrappedLines(it.lines, w - 0.4, f) * LINE_H(f) + (it.note ? 0.42 : 0) + 0.22);
    const tallest = (f, sh) => Math.max(...need(f, sh));
    while (tallest(fs, spotH) > maxH && fs > 12) fs -= 1;
    while (tallest(fs, spotH) > maxH && spotH > 0.75) spotH = Math.max(0.75, spotH - 0.05);
    if (tallest(fs, spotH) > maxH) console.warn(`[theme] cards row overflows on page ${slide.__rec && slide.__rec.n}: cut a line or split the page`);
    const h = opts.h || (opts.fill ? maxH : Math.min(maxH, Math.max(1.7, tallest(fs, spotH))));
    row.forEach((it, i) => {
      const x = x0 + i * (w + gap);
      const k = i + 1;
      cardBox(slide, x, top, w, h, anim('rise', k), { strip: !exists(it.spot) });
      let cy = top + 0.14;
      if (exists(it.spot)) {
        slide.addImage({ path: fitImage(it.spot, w - 0.36, spotH, 'top'), x: x + 0.18, y: cy, w: w - 0.36, h: spotH, ...anim('rise', k) });
        cy += spotH + 0.12;
      }
      if (it.n !== undefined) {
        slide.addShape(pptx.ShapeType.ellipse, { x: x + 0.2, y: cy, w: 0.42, h: 0.42, fill: { color: P.accent2 }, line: { color: P.accent2 }, ...anim('rise', k) });
        slide.addText(String(it.n), { x: x + 0.2, y: cy, w: 0.42, h: 0.42, fontFace: F.body, fontSize: T.body, color: 'FFFFFF', bold: true, align: 'center', valign: 'middle', margin: 0, ...anim('rise', k) });
      }
      slide.addText(runs(it.title, { fontFace: F.title, fontSize: T.cardTitle, color: P.title, bold: F.titleBold }, P.accent), {
        x: x + (it.n !== undefined ? 0.72 : 0.2), y: cy, w: w - (it.n !== undefined ? 0.9 : 0.4), h: 0.46, valign: 'middle', margin: 0, ...anim('rise', k),
      });
      cy += 0.52;
      const rich = [];
      (it.lines || []).forEach((l) => {
        const base = { fontFace: F.body, fontSize: fs, color: P.ink, breakLine: true };
        const rr = runs(l, base, P.accent);
        rr.forEach((r, ri) => {
          r.options.breakLine = ri === rr.length - 1;
          if (ri === 0) r.options.bullet = { code: '2022', indent: 14 };
        });
        rich.push(...rr);
      });
      const textH = Math.max(0.5, top + h - cy - (it.note ? 0.5 : 0.12));
      if (rich.length) {
        if (rich.length) rich[rich.length - 1].options.breakLine = false;

        slide.addText(rich, { x: x + 0.2, y: cy, w: w - 0.4, h: textH, valign: 'top', margin: 0, paraSpaceAfter: PARA, lineSpacingMultiple: LS, ...anim('fade', k) });
      }
      if (it.note) {
        slide.addText(runs(it.note, { fontFace: F.body, fontSize: T.small, color: P.muted, italic: true }, P.accent), {
          x: x + 0.2, y: top + h - 0.48, w: w - 0.4, h: 0.36, valign: 'middle', margin: 0, ...anim('fade', k),
        });
      }
      count(slide, 1, [it.title, ...(it.lines || []), it.note || ''].join(''));
    });
    slide.__bottom = Math.max(slide.__bottom || 0, top + h);
    return slide;
  }

  /** Horizontal steps with arrows. items: [{ title, lines:[...] }] */
  function steps(slide, items, opts = {}) {
    const n = items.length;
    const x0 = o.safe.x;
    const top = opts.y || slide.__contentTop || 1.65;
    const arrow = 0.42;
    const w = (o.safe.w - arrow * (n - 1)) / n;
    const maxH = (opts.bannerAfter ? 6.05 : 6.6) - top;
    let fs = T.body;
    const needAt = (f) => Math.max(...items.map((it) => 0.75 + 0.3 + wrappedLines(it.lines, w - 0.36, f) * LINE_H(f) + 0.3));
    while (needAt(fs) > maxH && fs > 12) fs -= 1;
    const need = needAt(fs);
    const h = opts.h || (opts.fill ? maxH : Math.min(maxH, Math.max(2.2, need)));
    items.forEach((it, i) => {
      const x = x0 + i * (w + arrow);
      const k = i + 1;
      slide.addShape(pptx.ShapeType.roundRect, { x, y: top, w, h: 0.62, rectRadius: 0.1, fill: { color: i % 2 ? P.accent2 : P.accent }, line: { color: 'FFFFFF', transparency: 100 }, ...anim('wipe', k) });
      slide.addText(`${i + 1}  ${it.title}`, { x, y: top, w, h: 0.62, fontFace: F.title, fontSize: T.cardTitle, color: 'FFFFFF', bold: F.titleBold, align: 'center', valign: 'middle', margin: 0, ...anim('wipe', k) });
      cardBox(slide, x, top + 0.75, w, h - 0.75, anim('wipe', k));
      const rich = [];
      (it.lines || []).forEach((l) => {
        const rr = runs(l, { fontFace: F.body, fontSize: T.body, color: P.ink }, P.accent);
        rr.forEach((r, ri) => { r.options.breakLine = ri === rr.length - 1; if (ri === 0) r.options.bullet = { code: '2022', indent: 14 }; });
        rich.push(...rr);
      });
      if (rich.length) rich[rich.length - 1].options.breakLine = false;

      if (rich.length) slide.addText(rich, { x: x + 0.18, y: top + 0.9, w: w - 0.36, h: h - 1.05, valign: 'top', margin: 0, paraSpaceAfter: PARA, lineSpacingMultiple: LS, ...anim('fade', k) });
      if (i < n - 1) {
        slide.addText('›', { x: x + w, y: top + 0.05, w: arrow, h: 0.55, fontFace: F.body, fontSize: 26, color: P.accent, align: 'center', valign: 'middle', margin: 0, ...anim('wipe', k) });
      }
      count(slide, 1, [it.title, ...(it.lines || [])].join(''));
    });
    slide.__bottom = Math.max(slide.__bottom || 0, top + h + 0.1);
    return slide;
  }

  /** Two columns: 这样做 / 而不是 (or any pair). */
  function compare(slide, left, right, opts = {}) {
    const top = opts.y || slide.__contentTop || 1.65;
    const gap = 0.4;
    const w = (o.safe.w - gap) / 2;
    const maxH = (opts.bannerAfter ? 6.05 : 6.6) - top;
    let fs = T.body + 1;
    const needAt = (f) => Math.max(...[left, right].map((c) => 0.62 + 0.35 + wrappedLines(c.lines, w - 0.44, f) * LINE_H(f) + 0.35));
    while (needAt(fs) > maxH && fs > 12) fs -= 1;
    const need = needAt(fs);
    const h = opts.h || (opts.fill ? maxH : Math.min(maxH, Math.max(2.4, need)));
    [[left, o.safe.x, P.accent2, 1], [right, o.safe.x + w + gap, P.accent, 2]].forEach(([col, x, color, k]) => {
      slide.addShape(pptx.ShapeType.roundRect, { x, y: top, w: 2.0, h: 0.5, rectRadius: 0.25, fill: { color }, line: { color }, ...anim('wipe', k) });
      slide.addText(col.label, { x, y: top, w: 2.0, h: 0.5, fontFace: F.body, fontSize: T.body + 1, color: 'FFFFFF', bold: true, align: 'center', valign: 'middle', margin: 0, ...anim('wipe', k) });
      cardBox(slide, x, top + 0.62, w, h - 0.62, anim('wipe', k));
      const rich = [];
      (col.lines || []).forEach((l) => {
        const rr = runs(l, { fontFace: F.body, fontSize: fs, color: P.ink }, color);
        rr.forEach((r, ri) => { r.options.breakLine = ri === rr.length - 1; if (ri === 0) r.options.bullet = { code: k === 1 ? '2713' : '2717', indent: 14 }; });
        rich.push(...rr);
      });
      if (rich.length) rich[rich.length - 1].options.breakLine = false;

      slide.addText(rich, { x: x + 0.22, y: top + 0.8, w: w - 0.44, h: h - 1.0, valign: 'top', margin: 0, paraSpaceAfter: PARA, lineSpacingMultiple: LS, ...anim('fade', k) });
      count(slide, 1, [col.label, ...(col.lines || [])].join(''));
    });
    slide.__bottom = Math.max(slide.__bottom || 0, top + h);
    return slide;
  }

  /** Checklist with boxes. items: ['...','...'] ; cols 1–2 */
  function checklist(slide, items, opts = {}) {
    const cols = opts.cols || (items.length > 5 ? 2 : 1);
    const top = opts.y || slide.__contentTop || 1.65;
    const gap = 0.35;
    const w = (o.safe.w - gap * (cols - 1)) / cols;
    const per = Math.ceil(items.length / cols);
    const maxH = (opts.bannerAfter ? 6.05 : 6.6) - top;
    const h = opts.h || (opts.fill ? maxH : Math.min(maxH, Math.max(2.0, 0.3 + per * 0.62)));
    for (let c = 0; c < cols; c++) {
      const x = o.safe.x + c * (w + gap);
      cardBox(slide, x, top, w, h, anim('rise', c + 1));
      const chunk = items.slice(c * per, (c + 1) * per);
      const rowH = Math.min(0.62, (h - 0.3) / Math.max(1, chunk.length));
      chunk.forEach((t, i) => {
        const y = top + 0.15 + i * rowH;
        slide.addShape(pptx.ShapeType.rect, { x: x + 0.22, y: y + 0.13, w: 0.3, h: 0.3, fill: { color: 'FFFFFF' }, line: { color: P.accent2, width: 1.25 }, ...anim('fade', c * per + i + 1) });
        slide.addText(runs(t, { fontFace: F.body, fontSize: T.body + 1, color: P.ink }, P.accent), { x: x + 0.65, y, w: w - 0.85, h: rowH, valign: 'middle', margin: 0, ...anim('fade', c * per + i + 1) });
        count(slide, 1, t);
      });
    }
    slide.__bottom = Math.max(slide.__bottom || 0, top + h);
    return slide;
  }

  /** Native table (职责表 / 评分表 / 时间表). header: [...], rows: [[...]] */
  function table(slide, header, rows, opts = {}) {
    const top = opts.y || slide.__contentTop || 1.65;
    const maxH = (opts.bannerAfter ? 6.05 : 6.6) - top;
    const colW = opts.colW || null;
    // shrink type for tall tables so rows stay inside the frame
    const nRows = rows.length + 1;
    const fs = opts.fontSize || (nRows >= 9 ? T.body - 2 : nRows >= 7 ? T.body - 1 : T.body);
    const rowH = Math.min(0.6, Math.max(0.34, maxH / nRows));
    const h = opts.h || Math.min(maxH, rowH * nRows);
    const data = [
      header.map((c) => ({ text: c, options: { bold: true, color: 'FFFFFF', fill: { color: P.accent2 }, fontFace: F.body, fontSize: fs, align: 'center', valign: 'middle' } })),
      ...rows.map((r, ri) => r.map((c, ci) => ({
        text: String(c).replace(/【|】/g, ''),
        options: { color: P.ink, fontFace: F.body, fontSize: fs, fill: { color: ri % 2 ? P.card : 'FFFFFF' }, valign: 'middle', align: ci === 0 ? 'center' : 'left', bold: ci === 0 },
      }))),
    ];
    slide.addTable(data, { x: o.safe.x, y: top, w: o.safe.w, h, rowH, colW, border: { type: 'solid', pt: 0.75, color: P.line }, margin: 0.05, autoPage: false, ...anim('fade', 1) });
    count(slide, rows.length, rows.flat().join(''));
    slide.__bottom = Math.max(slide.__bottom || 0, top + h);
    return slide;
  }

  /** Big quote page body (used sparingly; still needs a takeaway banner). */
  function quote(slide, text, by, opts = {}) {
    const top = opts.y || slide.__contentTop || 1.65;
    cardBox(slide, o.safe.x, top - 0.05, o.safe.w, 3.05, anim('fade', 1), { strip: false });
    slide.addText('“', { x: o.safe.x, y: top - 0.25, w: 1.2, h: 1.4, fontFace: F.title, fontSize: 72, color: P.accent, margin: 0, ...anim('fade', 1) });
    slide.addText(runs(text, { fontFace: F.title, fontSize: T.h2 - 2, color: P.title, bold: F.titleBold }, P.accent), { x: o.safe.x + 0.8, y: top + 0.2, w: o.safe.w - 1.6, h: 2.2, valign: 'middle', align: 'center', margin: 0, ...anim('rise', 1) });
    if (by) slide.addText(by, { x: o.safe.x + 0.8, y: top + 2.5, w: o.safe.w - 1.6, h: 0.4, fontFace: F.body, fontSize: T.body, color: P.muted, align: 'right', margin: 0, ...anim('fade', 2) });
    // an oath / pledge with several sentences is several units the teacher reads aloud
    const sentences = String(text).split(/[。；！？]/).filter((s) => s.trim().length >= 4).length;
    count(slide, Math.min(4, Math.max(1, sentences)), text);
    slide.__bottom = Math.max(slide.__bottom || 0, top + 3.0);
    return slide;
  }

  /** Interaction page: question + options (A/B/C…) with a hidden-until-click 提示. */
  function interaction(slide, question, options, hint, opts = {}) {
    const top = opts.y || slide.__contentTop || 1.65;
    cardBox(slide, o.safe.x, top, o.safe.w, 0.9, anim('fade', 1));
    slide.addText(runs(question, { fontFace: F.title, fontSize: T.cardTitle + 2, color: P.title, bold: F.titleBold }, P.accent), { x: o.safe.x + 0.25, y: top, w: o.safe.w - 0.5, h: 0.9, valign: 'middle', margin: 0, ...anim('fade', 1) });
    const n = options.length;
    const gap = 0.3;
    const w = (o.safe.w - gap * (n - 1)) / n;
    options.forEach((op, i) => {
      const x = o.safe.x + i * (w + gap);
      const y = top + 1.1;
      cardBox(slide, x, y, w, 1.9, anim('rise', 2));
      slide.addText(String.fromCharCode(65 + i), { x: x + 0.15, y: y + 0.15, w: 0.5, h: 0.5, fontFace: F.title, fontSize: T.h2 - 4, color: P.accent, bold: F.titleBold, margin: 0, ...anim('rise', 2) });
      slide.addText(runs(op, { fontFace: F.body, fontSize: T.body + 1, color: P.ink }, P.accent), { x: x + 0.2, y: y + 0.7, w: w - 0.4, h: 1.05, valign: 'top', margin: 0, ...anim('rise', 2) });
      count(slide, 1, op);
    });
    if (hint) {
      slide.addText(runs(hint, { fontFace: F.body, fontSize: T.body, color: P.accent2, bold: true }, P.accent), { x: o.safe.x, y: top + 3.2, w: o.safe.w, h: 0.5, valign: 'middle', margin: 0, ...anim('fade', 3) });
      count(slide, 1, hint);
    }
    slide.__bottom = Math.max(slide.__bottom || 0, top + (hint ? 3.7 : 3.1));
    return slide;
  }

  /**
   * Feature: one big true-aspect illustration on the left, 2–4 numbered points on the right.
   * items: [{ n, title, lines }]
   */
  function feature(slide, imgPath, items, opts = {}) {
    const top = opts.y || slide.__contentTop || 1.65;
    const maxH = (opts.bannerAfter ? 6.05 : 6.6) - top;
    const imgW = opts.imgW || 4.7;
    const imgH = Math.min(maxH, imgW / (opts.ratio || SK.spotRatio));
    const side = opts.side || 'left';
    const ix = side === 'left' ? o.safe.x : o.safe.x + o.safe.w - imgW;
    const tx = side === 'left' ? o.safe.x + imgW + 0.45 : o.safe.x;
    const tw = o.safe.w - imgW - 0.45;
    cardBox(slide, ix - 0.08, top - 0.08, imgW + 0.16, imgH + 0.16, anim('rise', 1), { strip: false });
    if (exists(imgPath)) slide.addImage({ path: fitImage(imgPath, imgW, imgH), x: ix, y: top, w: imgW, h: imgH, ...anim('rise', 1) });
    // per-item height from content; shrink body type until everything fits the column
    // tighter vertical rhythm than cards: title row 0.44, 1.15 line spacing, 2pt paragraph space
    const LSF = 1.15, PARAF = 2;
    const lineH = (f) => (f * LSF + PARAF) / 72;
    let fs = T.body;
    const need = (f) => items.map((it) => 0.44 + wrappedLines(it.lines, tw - 0.58, f) * lineH(f) + 0.12);
    while (need(fs).reduce((a, b) => a + b, 0) > maxH && fs > 12) fs -= 1;
    const heights = need(fs);
    const colH = Math.min(maxH, heights.reduce((a, b) => a + b, 0));
    if (heights.reduce((a, b) => a + b, 0) > maxH) console.warn(`[theme] feature column overflows on page ${slide.__rec && slide.__rec.n}: split the page`);
    // plate behind the text column so it reads on any background
    cardBox(slide, tx - 0.25, top - 0.08, tw + 0.4, Math.max(colH, imgH) + 0.16, anim('rise', 1), { strip: false });
    let y = top;
    items.forEach((it, i) => {
      const k = i + 2;
      const rowH = heights[i];
      slide.addShape(pptx.ShapeType.ellipse, { x: tx, y: y + 0.04, w: 0.44, h: 0.44, fill: { color: P.accent2 }, line: { color: P.accent2 }, ...anim('fade', k) });
      slide.addText(String(it.n !== undefined ? it.n : i + 1), { x: tx, y: y + 0.04, w: 0.44, h: 0.44, fontFace: F.body, fontSize: T.body, color: 'FFFFFF', bold: true, align: 'center', valign: 'middle', margin: 0, ...anim('fade', k) });
      slide.addText(runs(it.title, { fontFace: F.title, fontSize: T.cardTitle, color: P.title, bold: F.titleBold }, P.accent), { x: tx + 0.58, y, w: tw - 0.58, h: 0.44, valign: 'middle', margin: 0, ...anim('fade', k) });
      const rich = [];
      (it.lines || []).forEach((l) => {
        const rr = runs(l, { fontFace: F.body, fontSize: fs, color: P.ink }, P.accent);
        rr.forEach((r, ri) => { r.options.breakLine = ri === rr.length - 1; });
        rich.push(...rr);
      });
      if (rich.length) rich[rich.length - 1].options.breakLine = false;

      if (rich.length) slide.addText(rich, { x: tx + 0.58, y: y + 0.44, w: tw - 0.58, h: rowH - 0.48, valign: 'top', margin: 0, paraSpaceAfter: PARAF, lineSpacingMultiple: LSF, ...anim('fade', k) });
      if (i < items.length - 1) slide.addShape(pptx.ShapeType.line, { x: tx + 0.58, y: y + rowH - 0.06, w: tw - 0.58, h: 0, line: { color: P.line, width: 0.75, dashType: 'dash' }, ...anim('fade', k) });
      count(slide, 1, [it.title, ...(it.lines || [])].join(''));
      y += rowH;
    });
    slide.__bottom = Math.max(slide.__bottom || 0, Math.max(top + imgH + 0.08, y + 0.08));
    return slide;
  }

  /**
   * Dialogue: speech bubbles for 话术. items: [{ who, text, good }] (good=false → the "don't" version).
   */
  function dialogue(slide, items, opts = {}) {
    const top = opts.y || slide.__contentTop || 1.65;
    const maxH = (opts.bannerAfter ? 6.05 : 6.6) - top;
    const rowH = Math.min(1.15, maxH / items.length);
    items.forEach((it, i) => {
      const y = top + i * rowH;
      const k = i + 1;
      const right = i % 2 === 1;
      const bw = o.safe.w - 1.6;
      const bx = right ? o.safe.x + 1.5 : o.safe.x;
      const ax = right ? o.safe.x + o.safe.w - 0.95 : o.safe.x - 0.05;
      const fill = it.good === false ? 'F3E3E0' : cardFill;
      const edge = it.good === false ? P.accent : P.accent2;
      slide.addShape(pptx.ShapeType.ellipse, { x: right ? ax : o.safe.x, y: y + 0.1, w: 0.7, h: 0.7, fill: { color: edge }, line: { color: edge }, ...anim('fade', k) });
      slide.addText(it.who || (right ? '同学' : '老师'), { x: right ? ax : o.safe.x, y: y + 0.1, w: 0.7, h: 0.7, fontFace: F.body, fontSize: T.small, color: 'FFFFFF', bold: true, align: 'center', valign: 'middle', margin: 0, ...anim('fade', k) });
      const bxx = right ? bx - 0.2 : bx + 0.9;
      slide.addShape(pptx.ShapeType.roundRect, { x: bxx, y, w: bw - 0.8, h: rowH - 0.2, rectRadius: 0.22, fill: { color: fill }, line: { color: edge, width: 1.25 }, ...anim('fade', k) });
      slide.addText(runs((it.good === false ? '✗ ' : '✓ ') + it.text, { fontFace: F.body, fontSize: T.body + 1, color: P.ink }, edge), { x: bxx + 0.25, y, w: bw - 1.3, h: rowH - 0.2, valign: 'middle', margin: 0, ...anim('fade', k) });
      count(slide, 1, it.text);
    });
    slide.__bottom = Math.max(slide.__bottom || 0, top + rowH * items.length);
    return slide;
  }

  /** Timeline: 3–5 milestones on a horizontal rail. items: [{ when, title, lines }] */
  function timeline(slide, items, opts = {}) {
    const top = opts.y || slide.__contentTop || 1.65;
    const maxH = (opts.bannerAfter ? 6.05 : 6.6) - top;
    const n = items.length;
    const colW = o.safe.w / n;
    const railY = top + 0.55;
    let fs = T.body - 1;
    const textAvail = maxH - 1.9;
    const needAt = (f) => Math.max(...items.map((it) => wrappedLines(it.lines, colW - 0.6, f) * LINE_H(f)));
    while (needAt(fs) > textAvail && fs > 12) fs -= 1;
    slide.addShape(pptx.ShapeType.line, { x: o.safe.x + colW / 2, y: railY, w: o.safe.w - colW, h: 0, line: { color: P.accent2, width: 2.5 }, ...anim('fade', 1) });
    items.forEach((it, i) => {
      const cx = o.safe.x + colW * i + colW / 2;
      const k = i + 1;
      slide.addText(it.when, { x: cx - colW / 2, y: top - 0.05, w: colW, h: 0.4, fontFace: F.body, fontSize: T.small + 1, color: P.accent2, bold: true, align: 'center', valign: 'middle', margin: 0, ...anim('fade', k) });
      slide.addShape(pptx.ShapeType.ellipse, { x: cx - 0.19, y: railY - 0.19, w: 0.38, h: 0.38, fill: { color: cardFill }, line: { color: P.accent, width: 3 }, ...anim('fade', k) });
      const cy = railY + 0.42;
      cardBox(slide, cx - colW / 2 + 0.15, cy, colW - 0.3, maxH - 1.05, anim('rise', k), { strip: false });
      slide.addText(runs(it.title, { fontFace: F.title, fontSize: T.cardTitle - 1, color: P.title, bold: F.titleBold }, P.accent), { x: cx - colW / 2 + 0.3, y: cy + 0.15, w: colW - 0.6, h: 0.5, valign: 'middle', margin: 0, ...anim('rise', k) });
      const rich = [];
      (it.lines || []).forEach((l) => {
        const rr = runs(l, { fontFace: F.body, fontSize: T.body - 1, color: P.ink }, P.accent);
        rr.forEach((r, ri) => { r.options.breakLine = ri === rr.length - 1; if (ri === 0) r.options.bullet = { code: '2022', indent: 14 }; });
        rich.push(...rr);
      });
      if (rich.length) rich[rich.length - 1].options.breakLine = false;

      if (rich.length) slide.addText(rich, { x: cx - colW / 2 + 0.3, y: cy + 0.7, w: colW - 0.6, h: maxH - 1.9, valign: 'top', margin: 0, paraSpaceAfter: PARA, lineSpacingMultiple: LS, ...anim('fade', k) });
      count(slide, 1, [it.when, it.title, ...(it.lines || [])].join(''));
    });
    slide.__bottom = Math.max(slide.__bottom || 0, railY + 0.42 + maxH - 1.05);
    return slide;
  }

  /** Big numbers: 2–4 columns of hero figure + caption + 1–2 lines. items: [{ num, unit, caption, lines }] */
  function bigNumbers(slide, items, opts = {}) {
    const top = opts.y || slide.__contentTop || 1.65;
    const maxH = (opts.bannerAfter ? 6.05 : 6.6) - top;
    const n = items.length;
    const gap = 0.3;
    const w = (o.safe.w - gap * (n - 1)) / n;
    const cardH = Math.min(maxH, 3.9);
    let fs = T.body;
    const needAt = (f) => Math.max(...items.map((it) => wrappedLines(it.lines, w - 0.5, f) * LINE_H(f)));
    while (needAt(fs) > cardH - 2.2 && fs > 12) fs -= 1;
    items.forEach((it, i) => {
      const x = o.safe.x + i * (w + gap);
      const k = i + 1;
      cardBox(slide, x, top, w, cardH, anim('rise', k), { strip: false });
      slide.addText([{ text: String(it.num), options: { fontFace: F.title, fontSize: 60, color: P.accent, bold: F.titleBold } }, { text: it.unit ? ` ${it.unit}` : '', options: { fontFace: F.body, fontSize: T.lead, color: P.muted, bold: true } }], { x: x + 0.2, y: top + 0.2, w: w - 0.4, h: 1.3, align: 'center', valign: 'middle', margin: 0, ...anim('rise', k) });
      slide.addText(runs(it.caption, { fontFace: F.title, fontSize: T.cardTitle, color: P.title, bold: F.titleBold }, P.accent), { x: x + 0.2, y: top + 1.5, w: w - 0.4, h: 0.5, align: 'center', valign: 'middle', margin: 0, ...anim('fade', k) });
      const rich = [];
      (it.lines || []).forEach((l) => { const rr = runs(l, { fontFace: F.body, fontSize: fs, color: P.ink }, P.accent); rr.forEach((r, ri) => { r.options.breakLine = ri === rr.length - 1; }); rich.push(...rr); });
      if (rich.length) rich[rich.length - 1].options.breakLine = false;

      if (rich.length) slide.addText(rich, { x: x + 0.25, y: top + 2.05, w: w - 0.5, h: cardH - 2.2, align: 'center', valign: 'top', margin: 0, paraSpaceAfter: PARA, lineSpacingMultiple: LS, ...anim('fade', k) });
      count(slide, 1, [it.num, it.caption, ...(it.lines || [])].join(''));
    });
    slide.__bottom = Math.max(slide.__bottom || 0, top + cardH);
    return slide;
  }

  /** keyword color inside the banner: light text → pale yellow; dark text → accent */
  function bannerKw() {
    const hex = P.bannerText.replace('#', '');
    const lum = (parseInt(hex.slice(0, 2), 16) * 299 + parseInt(hex.slice(2, 4), 16) * 587 + parseInt(hex.slice(4, 6), 16) * 114) / 1000;
    return lum > 140 ? 'FFE08A' : P.accent;
  }

  /** Transparent character cut-out placed at a box (keeps aspect; anchored bottom-right of the box). */
  function mascot(slide, imgPath, box, k = 7) {
    if (!exists(imgPath)) return slide;
    let ratio = 4 / 3;
    try { const meta = pngSize(imgPath); if (meta) ratio = meta.w / meta.h; } catch (e) { /* keep default */ }
    let w = box.h * ratio, h = box.h;
    if (w > box.w) { w = box.w; h = w / ratio; }
    slide.addImage({ path: imgPath, x: box.x + box.w - w, y: box.y + box.h - h, w, h, ...anim('fade', k) });
    return slide;
  }
  function pngSize(p) {
    const fd = fs.openSync(p, 'r');
    const buf = Buffer.alloc(24);
    fs.readSync(fd, buf, 0, 24, 0);
    fs.closeSync(fd);
    if (buf.toString('ascii', 1, 4) !== 'PNG') return null;
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }

  /**
   * Fill the free zone under the content (above the banner) with a note (left) and a mascot (right).
   * If there is no room, the mascot goes to the top-right corner and the note is dropped (it lives in the 讲稿).
   */
  function extras(slide, { note: noteText, mascot: mascotPath, bannerAfter = true } = {}) {
    const limit = bannerAfter ? 6.05 : 6.6;
    const bottom = slide.__bottom || (slide.__contentTop || 1.65);
    const free = limit - bottom;
    const placed = { note: false, mascot: false };
    if (free >= 1.0) {
      const h = Math.min(1.6, free - 0.12);
      if (mascotPath) { mascot(slide, mascotPath, { x: W - 0.9 - 3.2, y: limit - h - 0.02, w: 3.2, h }); placed.mascot = true; }
      if (noteText) { note(slide, noteText, { x: o.safe.x, y: bottom + 0.14, w: Math.min(4.6, o.safe.w - 3.6), h: Math.min(1.25, free - 0.24), rotate: -1.5 }); placed.note = true; }
    } else if (free >= 0.9) {
      if (mascotPath) { mascot(slide, mascotPath, { x: W - 0.9 - 2.2, y: bottom + 0.06, w: 2.2, h: free - 0.12 }); placed.mascot = true; }
    } else if (mascotPath) {
      mascot(slide, mascotPath, { x: W - 2.6, y: 0.22, w: 1.5, h: 1.0 });
      placed.mascot = true;
    }
    return placed;
  }

  /** Bottom takeaway banner — every content page should end with one. */
  function banner(slide, text, opts = {}) {
    const y = opts.y || 6.18;
    if (SK.bannerStyle === 'ribbon') {
      // ribbon: flat bar with folded ends
      slide.addShape(pptx.ShapeType.rect, { x: o.safe.x + 0.25, y: y + 0.08, w: o.safe.w - 0.5, h: 0.5, fill: { color: P.banner }, line: { color: P.banner }, ...anim('fade', 9) });
      slide.addShape(pptx.ShapeType.chevron, { x: o.safe.x, y: y + 0.14, w: 0.5, h: 0.38, fill: { color: P.accent2 }, line: { color: P.accent2 }, rotate: 180, ...anim('fade', 9) });
      slide.addShape(pptx.ShapeType.chevron, { x: o.safe.x + o.safe.w - 0.5, y: y + 0.14, w: 0.5, h: 0.38, fill: { color: P.accent2 }, line: { color: P.accent2 }, ...anim('fade', 9) });
      slide.addText(runs(text, { fontFace: F.title, fontSize: T.banner, color: P.bannerText, bold: F.titleBold }, bannerKw()), { x: o.safe.x + 0.6, y: y + 0.08, w: o.safe.w - 1.2, h: 0.5, valign: 'middle', align: 'center', margin: 0, objectName: 'fade:9-banner' });
      count(slide, 1, text);
      return slide;
    }
    slide.addShape(pptx.ShapeType.roundRect, { x: o.safe.x, y, w: o.safe.w, h: 0.58, rectRadius: 0.29, fill: { color: P.banner }, line: { color: P.banner }, ...anim('fade', 9) });
    slide.addText(runs(text, { fontFace: F.title, fontSize: T.banner, color: P.bannerText, bold: F.titleBold }, bannerKw()), { x: o.safe.x + 0.3, y, w: o.safe.w - 0.6, h: 0.58, valign: 'middle', align: 'center', margin: 0, ...anim('fade', 9), objectName: 'fade:9-banner' });
    count(slide, 1, text);
    return slide;
  }

  /** Free-placed spot image (inside safe zone), e.g. a scene beside a list. */
  function spot(slide, imgPath, box, k = 1) {
    if (!exists(imgPath)) return slide;
    slide.addShape(pptx.ShapeType.roundRect, { x: box.x - 0.06, y: box.y - 0.06, w: box.w + 0.12, h: box.h + 0.12, rectRadius: 0.14, fill: { color: P.card }, line: { color: P.line, width: 1 }, ...anim('rise', k) });
    slide.addImage({ path: fitImage(imgPath, box.w, box.h), x: box.x, y: box.y, w: box.w, h: box.h, ...anim('rise', k) });
    return slide;
  }

  /** Closing page: title + 4 words + thanks. */
  function closing({ title, words = [], thanks = '谢谢各位老师', hero }) {
    const s = newSlide('PLAIN', 'closing');
    const img = hero || o.assets.cover;
    if (exists(img)) s.addImage({ path: fitImage(img, W, H), x: 0, y: 0, w: W, h: H, transparency: 35, ...stay() });
    s.addShape(pptx.ShapeType.roundRect, { x: 2.4, y: 1.5, w: 8.53, h: 4.5, rectRadius: 0.2, fill: { color: cardFill, transparency: 6 }, line: { color: P.line, width: 1 }, ...stay() });
    const cEm = [...String(title).replace(/【|】/g, '')].reduce((a, ch) => a + (/[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.55), 0);
    const cSize = Math.max(30, Math.min(48, Math.floor((8.13 * 72) / (cEm * 1.08))));
    s.addText(runs(title, { fontFace: F.title, fontSize: cSize, color: P.title, bold: F.titleBold }, P.accent), { x: 2.6, y: 1.75, w: 8.13, h: (cSize * 1.35) / 72 + 0.1, align: 'center', valign: 'middle', margin: 0, ...anim('rise', 1) });
    const n = words.length;
    if (n) {
      const w = 1.6, gap = (8.13 - n * w) / Math.max(1, n - 1);
      words.forEach((wd, i) => {
        const x = 2.6 + i * (w + gap);
        s.addShape(pptx.ShapeType.ellipse, { x: x + 0.35, y: 3.0, w: 0.9, h: 0.9, fill: { color: P.accent2 }, line: { color: P.accent2 }, ...anim('fade', 2) });
        s.addText(wd.word, { x: x + 0.35, y: 3.0, w: 0.9, h: 0.9, fontFace: F.title, fontSize: T.cardTitle + 1, color: 'FFFFFF', bold: F.titleBold, align: 'center', valign: 'middle', margin: 0, ...anim('fade', 2) });
        if (wd.line) s.addText(wd.line, { x, y: 4.05, w, h: 0.9, fontFace: F.body, fontSize: T.small + 1, color: P.ink, align: 'center', valign: 'top', margin: 0, ...anim('fade', 3) });
        count(s, 1, (wd.word || '') + (wd.line || ''));
      });
    }
    s.addText(thanks, { x: 2.6, y: 5.2, w: 8.13, h: 0.5, fontFace: F.body, fontSize: T.lead, color: P.muted, align: 'center', valign: 'middle', margin: 0, objectName: 'fade:4-closing' });
    return s;
  }

  async function save(outPath, opts = {}) {
    const total = o.total || state.n;
    state.badges.forEach(({ slide, n }) => drawBadge(slide, n, total));
    state.badges.length = 0;
    const thin = state.pages.filter((p) => p.role === 'content' && (p.units < 3 || p.chars < 60));
    if (thin.length && !opts.allowThin) {
      const list = thin.map((p) => `#${p.n}(units=${p.units},chars=${p.chars})`).join(' ');
      throw new Error(`[theme] density gate failed on content pages: ${list}. Each content page needs ≥3 units and ≥60 chars, or pass {allowThin:true}.`);
    }
    await Promise.all(pendingFits);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await pptx.writeFile({ fileName: outPath });
    return { path: outPath, pages: state.n, thin: thin.map((p) => p.n) };
  }

  return {
    pptx, W, H, palette: P, fonts: F, type: T, state,
    cover, section, page, cards, steps, compare, checklist, table, quote, interaction, feature, dialogue, timeline, bigNumbers, note, stickers, mascot, extras, banner, spot, closing, badge, save, fitImage,
    runs: (t) => runs(t, { fontFace: F.body, fontSize: T.body, color: P.ink }, P.accent),
  };
}

module.exports = { createDeck, DEFAULTS, W, H };
