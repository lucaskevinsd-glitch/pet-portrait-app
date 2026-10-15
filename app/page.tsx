'use client';

import { useMemo, useRef, useState } from 'react';
import { STYLES, type StyleId } from '../lib/styles';
import { SCENES, type SceneId } from '../lib/scenes';
import {
  buildPromptSet,
  EMPTY_IDENTITY,
  type IdentityCard,
  type PromptSet,
} from '../lib/prompt';

interface Photo {
  id: string;
  dataUrl: string;
}

const ASPECTS = ['1:1', '3:4', '4:3', '4:5', '9:16', '16:9'];
const SIZES = ['1K', '2K', '4K'];
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 单张本地预览上限 10MB
const MAX_FIELD_LEN = 200;

/**
 * 前端本地压缩：最长边 1024px，JPEG 0.85，减少内存占用。
 * 照片只保存在浏览器内存里，不上传到任何服务器。
 */
async function compressImage(file: File): Promise<Photo> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const el = new Image();
    el.onload = () => res(el);
    el.onerror = rej;
    el.src = dataUrl;
  });
  const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持 Canvas');
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL('image/jpeg', 0.85);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    dataUrl: out,
  };
}

/** 复制：优先 Clipboard API，失败时用 textarea 兜底 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

type DraftKey = 'main' | 'negative' | 'scene';

export default function Home() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [mainIndex, setMainIndex] = useState(0);
  const [identity, setIdentity] = useState<IdentityCard>(EMPTY_IDENTITY);
  const [styleId, setStyleId] = useState<StyleId>('P01');
  const [sceneId, setSceneId] = useState<SceneId>('auto');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [imageSize, setImageSize] = useState('1K');
  const [generated, setGenerated] = useState<PromptSet | null>(null);
  /** 可编辑的提示词副本：用户改完后保留，直到下一次重新生成 */
  const [drafts, setDrafts] = useState<Record<DraftKey, string> | null>(null);
  /** 生成时所用参数的快照，用于提示“参数已变化，请重新生成” */
  const [generatedFrom, setGeneratedFrom] = useState('');
  const [copied, setCopied] = useState<string>('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const styleName = useMemo(
    () => STYLES.find((s) => s.id === styleId)?.name ?? styleId,
    [styleId],
  );

  const setId = (k: keyof IdentityCard, v: string) =>
    setIdentity((p) => ({ ...p, [k]: v.slice(0, MAX_FIELD_LEN) }));

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files).slice(0, 5 - photos.length);
    if (list.length === 0) {
      setError('最多上传 5 张照片。');
      return;
    }
    setError('');
    const done: Photo[] = [];
    for (const f of list) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
        setError(`跳过 ${f.name}：请用 JPG / PNG / WebP。`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        setError(`跳过 ${f.name}：单张照片超过 10MB。`);
        continue;
      }
      try {
        done.push(await compressImage(f));
      } catch {
        setError(`读取 ${f.name} 失败，请换一张。`);
      }
    }
    if (done.length) setPhotos((p) => [...p, ...done].slice(0, 5));
  };

  const clearAllPhotos = () => {
    setPhotos([]);
    setMainIndex(0);
    if (fileRef.current) fileRef.current.value = '';
  };

  const inputsSnapshot = JSON.stringify({
    identity,
    styleId,
    sceneId,
    aspectRatio,
    imageSize,
  });
  const dirty = generated !== null && generatedFrom !== inputsSnapshot;

  const generate = () => {
    const set = buildPromptSet(styleId, identity, {
      aspectRatio,
      imageSize,
      sceneId,
    });
    setGenerated(set);
    setDrafts({ main: set.main, negative: set.negative, scene: set.scene });
    setGeneratedFrom(inputsSnapshot);
    setError('');
  };

  const onCopy = async (key: string, text: string) => {
    const ok = await copyText(text);
    setCopied(ok ? `${key}已复制` : '复制失败，请手动长按选择复制');
    setTimeout(() => setCopied(''), 2000);
  };

  const copyAll = () => {
    if (!drafts || !generated) return;
    const all = [
      '## 主提示词',
      drafts.main,
      '',
      '## 负面提示词',
      drafts.negative,
      '',
      '## 场景提示词',
      drafts.scene,
      '',
      '## 使用说明',
      generated.usage,
    ].join('\n');
    onCopy('全部', all);
  };

  const downloadTxt = () => {
    if (!drafts || !generated) return;
    const filled = (
      Object.entries(identity) as [keyof IdentityCard, string][]
    )
      .filter(([, v]) => v.trim())
      .map(([k, v]) => `- ${k}：${v.trim()}`)
      .join('\n');
    const lines = [
      'AI 宠物写真提示词制作包',
      `宠物：${identity.petName || '（未填）'} / 品种：${identity.breed || '（未填）'}`,
      `风格：${styleName}（${styleId}）`,
      `比例：${aspectRatio} / 清晰度：${imageSize}`,
      `参考照片：${photos.length} 张（本文件不含照片，照片只在浏览器本地预览）`,
      '',
      '--- 已确认的宠物特征（仅含你填写的项，未填项不编造）---',
      filled || '（未填写特征卡，使用时请以参考照片为准）',
      '',
      '--- 主提示词 ---',
      drafts.main,
      '',
      '--- 负面提示词 ---',
      drafts.negative,
      '',
      '--- 场景提示词 ---',
      drafts.scene,
      '',
      '--- 使用说明 ---',
      generated.usage,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pet-portrait-prompt-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const fields: { key: keyof IdentityCard; label: string; hint: string }[] = [
    { key: 'petName', label: '宠物名字', hint: '如：团团' },
    { key: 'breed', label: '品种', hint: '如：英短蓝猫' },
    { key: 'coat', label: '毛色', hint: '如：蓝灰色' },
    { key: 'markings', label: '花纹分布', hint: '如：胸口一撮白毛' },
    { key: 'eyes', label: '眼睛', hint: '如：金色圆眼' },
    { key: 'ears', label: '耳朵', hint: '如：立耳' },
    { key: 'nose', label: '鼻子', hint: '如：粉色小鼻子' },
    { key: 'faceShape', label: '脸型', hint: '如：圆脸、尖脸' },
    { key: 'bodyType', label: '体型', hint: '如：偏胖、短腿' },
    { key: 'specialMarks', label: '特殊标记', hint: '如：左前爪白手套、异瞳' },
  ];

  return (
    <main>
      <h1>🐾 AI 宠物写真提示词生成器</h1>
      <p className="sub">
        上传宠物照片 → 填写特征 → 选风格 → 本地生成可直接复制到 Gemini
        等生图工具使用的高质量提示词。本网站不调用任何生图 API，不产生费用；照片只在浏览器本地预览，不会上传。
      </p>

      <div className="card">
        <h2>第 1 步 · 上传照片（1~5 张）</h2>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => onFiles(e.target.files)}
        />
        <p className="hint">
          点一张照片设为主参考图（建议最清晰的正脸照）。照片仅用于你自己对照填写特征和本地预览，不会被上传，也不会被网站分析。
        </p>
        <div className="thumbs">
          {photos.map((p, i) => (
            <div
              key={p.id}
              className={`thumb ${i === mainIndex ? 'main' : ''}`}
              onClick={() => setMainIndex(i)}
            >
              <img src={p.dataUrl} alt="宠物参考" />
              {i === mainIndex && <span className="badge">主参考</span>}
              <button
                className="del"
                onClick={(e) => {
                  e.stopPropagation();
                  setPhotos((pp) => pp.filter((x) => x.id !== p.id));
                  setMainIndex(0);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {photos.length > 0 && (
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn sec small" onClick={clearAllPhotos}>
              清除全部照片
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h2>第 2 步 · 宠物特征卡（手动确认）</h2>
        <p className="hint">
          请对照照片填写。本网站不会分析照片，也不会猜测特征；没填的项不会编造，提示词会要求生图工具以照片为准。已填的特征会在提示词里锁定为最高优先级。
        </p>
        {fields.map((f) => (
          <div key={f.key}>
            <label>
              {f.label}
              {identity[f.key].trim() && (
                <span className="lock"> 🔒 已锁定</span>
              )}
            </label>
            <input
              type="text"
              value={identity[f.key]}
              maxLength={MAX_FIELD_LEN}
              onChange={(e) => setId(f.key, e.target.value)}
              placeholder={f.hint}
            />
          </div>
        ))}
      </div>

      <div className="card">
        <h2>第 3 步 · 风格与出图参数</h2>
        <label>写真风格</label>
        <div className="styles">
          {STYLES.map((s) => (
            <div
              key={s.id}
              className={`style ${styleId === s.id ? 'sel' : ''}`}
              onClick={() => setStyleId(s.id)}
            >
              <div className="n">{s.name}</div>
              <div className="t">{s.tagline}</div>
              <div className="id">{s.id}</div>
            </div>
          ))}
        </div>
        <label>场景</label>
        <select
          value={sceneId}
          onChange={(e) => setSceneId(e.target.value as SceneId)}
        >
          {SCENES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="row">
          <div>
            <label>图片比例</label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
            >
              {ASPECTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>清晰度</label>
            <select
              value={imageSize}
              onChange={(e) => setImageSize(e.target.value)}
            >
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="hint">
          比例和清晰度会写进主提示词的输出要求里。切换风格、场景或参数后，点下方按钮重新生成即可更新提示词。
        </p>
      </div>

      <div className="card">
        <h2>第 4 步 · 生成并预览提示词</h2>
        <button className="btn" onClick={generate}>
          {generated ? '重新生成提示词' : '生成提示词'}
        </button>
        {photos.length === 0 && (
          <p className="hint">
            未上传照片：提示词仍可生成，但使用时请务必上传参考照片，生图工具需要照片才能保持宠物长相一致。
          </p>
        )}
        {dirty && (
          <p className="warn">
            特征、风格、场景或参数已变化，当前预览是旧版本，请点「重新生成提示词」更新。
          </p>
        )}
        {generated && drafts && (
          <>
            {(
              [
                { key: 'main' as DraftKey, title: '主提示词' },
                { key: 'negative' as DraftKey, title: '负面提示词' },
                { key: 'scene' as DraftKey, title: '场景提示词' },
              ]
            ).map((b) => (
              <div key={b.key} className="prompt-block">
                <div className="prompt-head">
                  <b>{b.title}</b>
                  <button
                    className="btn small sec"
                    onClick={() => onCopy(b.title, drafts[b.key])}
                  >
                    一键复制
                  </button>
                </div>
                <textarea
                  className="prompt-text"
                  value={drafts[b.key]}
                  rows={b.key === 'main' ? 14 : 4}
                  onChange={(e) =>
                    setDrafts((d) =>
                      d ? { ...d, [b.key]: e.target.value } : d,
                    )
                  }
                />
                <p className="hint">
                  可直接编辑，修改会保留；点「重新生成提示词」会用模板重新生成并覆盖编辑。
                </p>
              </div>
            ))}
            <div className="prompt-block">
              <div className="prompt-head">
                <b>使用说明</b>
              </div>
              <p className="usage">{generated.usage}</p>
            </div>
            {copied && <div className="copied">{copied}</div>}
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn sec" onClick={copyAll}>
                复制全部提示词
              </button>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn sec" onClick={downloadTxt}>
                下载完整 TXT 文件
              </button>
            </div>
          </>
        )}
      </div>

      {error && <div className="err">{error}</div>}

      <div className="card">
        <h2>说明</h2>
        <details>
          <summary>零 API 与隐私</summary>
          <p className="muted">
            本网站不调用 Gemini API 或任何其他模型 API，不产生费用，也不需要
            API Key。照片只在浏览器内存里做本地预览，不会上传到服务器，不会被记录；关闭页面或点「清除全部照片」后，本地预览即被清理。
          </p>
        </details>
        <details>
          <summary>特征锁定</summary>
          <p className="muted">
            你填写的特征会出现在主提示词最前面的「身份锁定」区块，并声明为最高优先级；没填的特征不会被编造，提示词会要求生图工具以参考照片为准。
          </p>
        </details>
      </div>
    </main>
  );
}
