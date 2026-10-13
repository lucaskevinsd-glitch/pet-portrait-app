'use client';

import { useMemo, useRef, useState } from 'react';
import { STYLES, type StyleId } from '../lib/styles';
import {
  buildPrompt,
  EMPTY_IDENTITY,
  NEGATIVE_HINT,
  type IdentityCard,
} from '../lib/prompt';
import {
  IMAGE_SIZE_LABEL,
  estimateBatchCost,
  formatUSD,
  pricePerImage,
  type ImageSize,
} from '../lib/pricing';

interface Photo {
  id: string;
  dataUrl: string;
  base64: string;
  mimeType: string;
}

interface GenResult {
  id: string;
  styleId: StyleId;
  stage: 'master' | 'extend';
  status: 'generating' | 'done' | 'error';
  data?: string;
  mimeType?: string;
  error?: string;
}

const ASPECTS = ['1:1', '3:4', '4:3', '9:16', '16:9'];

/** 前端压缩：最长边 1024px，JPEG 0.85，控制请求体远小于 Vercel 4.5MB 上限 */
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
    base64: out.split(',')[1],
    mimeType: 'image/jpeg',
  };
}

async function callGenerate(body: {
  prompt: string;
  images: { data: string; mimeType: string }[];
  aspectRatio: string;
  imageSize: ImageSize;
}): Promise<{ data: string; mimeType: string }> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.message || `请求失败（${res.status}）`);
  }
  return json.image;
}

export default function Home() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [mainIndex, setMainIndex] = useState(0);
  const [identity, setIdentity] = useState<IdentityCard>(EMPTY_IDENTITY);
  const [masterStyle, setMasterStyle] = useState<StyleId>('P01');
  const [extendStyles, setExtendStyles] = useState<StyleId[]>([]);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [imageSize, setImageSize] = useState<ImageSize>('1K');
  const [stage, setStage] = useState<'input' | 'master' | 'extend'>('input');
  const [master, setMaster] = useState<GenResult | null>(null);
  const [results, setResults] = useState<GenResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<null | {
    kind: 'master' | 'extend' | 'regen';
    count: number;
    inputImages: number;
    styleId?: StyleId;
    resultId?: string;
  }>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const masterStyleName = useMemo(
    () => STYLES.find((s) => s.id === masterStyle)?.name ?? masterStyle,
    [masterStyle],
  );

  const setId = (k: keyof IdentityCard, v: string) =>
    setIdentity((p) => ({ ...p, [k]: v }));

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
      try {
        done.push(await compressImage(f));
      } catch {
        setError(`读取 ${f.name} 失败，请换一张。`);
      }
    }
    if (done.length) setPhotos((p) => [...p, ...done].slice(0, 5));
  };

  /** 主参考图排第一位，其余按上传顺序 */
  const orderedPhotos = useMemo(() => {
    if (!photos.length) return [];
    const copy = [...photos];
    const [m] = copy.splice(Math.min(mainIndex, copy.length - 1), 1);
    return [m, ...copy];
  }, [photos, mainIndex]);

  const runMaster = async () => {
    if (!photos.length) return;
    setBusy(true);
    setError('');
    const prompt = buildPrompt(masterStyle, identity, 'master');
    const id = `master-${Date.now()}`;
    setMaster({
      id,
      styleId: masterStyle,
      stage: 'master',
      status: 'generating',
    });
    try {
      const img = await callGenerate({
        prompt,
        images: orderedPhotos.map((p) => ({
          data: p.base64,
          mimeType: p.mimeType,
        })),
        aspectRatio,
        imageSize,
      });
      setMaster({
        id,
        styleId: masterStyle,
        stage: 'master',
        status: 'done',
        data: img.data,
        mimeType: img.mimeType,
      });
      setStage('master');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '生成失败';
      setMaster({
        id,
        styleId: masterStyle,
        stage: 'master',
        status: 'error',
        error: msg,
      });
      setError(msg);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const runExtend = async () => {
    if (!master?.data || extendStyles.length === 0) return;
    setBusy(true);
    setError('');
    const base: GenResult[] = extendStyles.map((sid) => ({
      id: `ext-${sid}-${Date.now()}`,
      styleId: sid,
      stage: 'extend',
      status: 'generating' as const,
    }));
    setResults((p) => [...p, ...base]);
    // 逐张顺序调用：避免并发冲额度，也便于单张失败单独重试
    for (const item of base) {
      const prompt = buildPrompt(item.styleId, identity, 'extend');
      try {
        const img = await callGenerate({
          prompt,
          images: [
            {
              data: orderedPhotos[0].base64,
              mimeType: orderedPhotos[0].mimeType,
            },
            { data: master.data!, mimeType: master.mimeType || 'image/png' },
          ],
          aspectRatio,
          imageSize,
        });
        setResults((p) =>
          p.map((r) =>
            r.id === item.id
              ? { ...r, status: 'done', data: img.data, mimeType: img.mimeType }
              : r,
          ),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : '生成失败';
        setResults((p) =>
          p.map((r) =>
            r.id === item.id ? { ...r, status: 'error', error: msg } : r,
          ),
        );
      }
    }
    setBusy(false);
    setConfirm(null);
    setStage('extend');
  };

  const regenOne = async (resultId: string, styleId: StyleId) => {
    if (!master?.data) return;
    setBusy(true);
    setError('');
    setResults((p) =>
      p.map((r) =>
        r.id === resultId ? { ...r, status: 'generating', error: undefined } : r,
      ),
    );
    try {
      const img = await callGenerate({
        prompt: buildPrompt(styleId, identity, 'extend'),
        images: [
          {
            data: orderedPhotos[0].base64,
            mimeType: orderedPhotos[0].mimeType,
          },
          { data: master.data!, mimeType: master.mimeType || 'image/png' },
        ],
        aspectRatio,
        imageSize,
      });
      setResults((p) =>
        p.map((r) =>
          r.id === resultId
            ? { ...r, status: 'done', data: img.data, mimeType: img.mimeType }
            : r,
        ),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : '生成失败';
      setResults((p) =>
        p.map((r) =>
          r.id === resultId ? { ...r, status: 'error', error: msg } : r,
        ),
      );
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const downloadOne = (name: string, data: string, mime: string) => {
    const a = document.createElement('a');
    a.href = `data:${mime};base64,${data}`;
    a.download = name;
    a.click();
  };

  const downloadAll = () => {
    const done = [master, ...results].filter(
      (r): r is GenResult => !!r && r.status === 'done' && !!r.data,
    );
    done.forEach((r, i) => {
      setTimeout(
        () =>
          downloadOne(
            `${identity.petName || 'pet'}-${r.styleId}.png`,
            r.data!,
            r.mimeType || 'image/png',
          ),
        i * 300,
      );
    });
  };

  const exportTxt = () => {
    const lines = [
      `AI 宠物写真订单制作包`,
      `宠物：${identity.petName || '（未填）'} / 品种：${identity.breed || '（未填）'}`,
      `主写真风格：${masterStyleName}`,
      `扩展风格：${extendStyles
        .map((s) => STYLES.find((x) => x.id === s)?.name)
        .join('、') || '（无）'}`,
      `比例：${aspectRatio} / 清晰度：${imageSize}`,
      ``,
      `--- 主写真提示词 ---`,
      buildPrompt(masterStyle, identity, 'master'),
      ``,
      `--- 负面约束 ---`,
      NEGATIVE_HINT,
      ``,
      `--- 质检清单 ---`,
      '□ 花纹位置与原图一致  □ 眼睛颜色一致  □ 耳朵形状一致  □ 无多余文字/水印',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pet-portrait-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const masterCost = estimateBatchCost(1, imageSize, photos.length);
  const extendCost = estimateBatchCost(
    Math.max(extendStyles.length, 1),
    imageSize,
    2,
  );

  return (
    <main>
      <h1>🐾 AI 宠物写真 · 真实出图</h1>
      <p className="sub">
        上传宠物照片 → 选风格 → Gemini（Nano Banana 2.1）真实生成。单次调用只出 1
        张图，每张按 {formatUSD(pricePerImage(imageSize))}（{imageSize}）估算。
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
          点一张照片设为主参考图（建议最清晰的正脸照）。上传前会自动压缩到
          1024px 内，照片只用于本次生成，不保存到服务器。
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
      </div>

      <div className="card">
        <h2>第 2 步 · 宠物特征卡</h2>
        <p className="hint">
          填得越准，生成结果越像。特征会拼进每一次生成提示词。
        </p>
        <div className="row">
          <div>
            <label>宠物名字</label>
            <input
              type="text"
              value={identity.petName}
              onChange={(e) => setId('petName', e.target.value)}
              placeholder="如：团团"
            />
          </div>
          <div>
            <label>品种</label>
            <input
              type="text"
              value={identity.breed}
              onChange={(e) => setId('breed', e.target.value)}
              placeholder="如：英短蓝猫"
            />
          </div>
        </div>
        <div className="row">
          <div>
            <label>毛色</label>
            <input
              type="text"
              value={identity.coat}
              onChange={(e) => setId('coat', e.target.value)}
              placeholder="如：蓝灰色"
            />
          </div>
          <div>
            <label>花纹分布</label>
            <input
              type="text"
              value={identity.markings}
              onChange={(e) => setId('markings', e.target.value)}
              placeholder="如：胸口一撮白毛"
            />
          </div>
        </div>
        <div className="row">
          <div>
            <label>眼睛</label>
            <input
              type="text"
              value={identity.eyes}
              onChange={(e) => setId('eyes', e.target.value)}
              placeholder="如：金色圆眼"
            />
          </div>
          <div>
            <label>耳朵</label>
            <input
              type="text"
              value={identity.ears}
              onChange={(e) => setId('ears', e.target.value)}
              placeholder="如：立耳"
            />
          </div>
        </div>
        <div className="row">
          <div>
            <label>鼻子</label>
            <input
              type="text"
              value={identity.nose}
              onChange={(e) => setId('nose', e.target.value)}
              placeholder="如：粉色小鼻子"
            />
          </div>
          <div>
            <label>体型</label>
            <input
              type="text"
              value={identity.bodyType}
              onChange={(e) => setId('bodyType', e.target.value)}
              placeholder="如：偏胖、短腿"
            />
          </div>
        </div>
        <label>特殊标记</label>
        <input
          type="text"
          value={identity.specialMarks}
          onChange={(e) => setId('specialMarks', e.target.value)}
          placeholder="如：左前爪白手套、异瞳"
        />
      </div>

      <div className="card">
        <h2>第 3 步 · 风格与出图设置</h2>
        <label>主写真风格（第一阶段只生成这 1 种）</label>
        <div className="styles">
          {STYLES.map((s) => (
            <div
              key={s.id}
              className={`style ${masterStyle === s.id ? 'sel' : ''}`}
              onClick={() => setMasterStyle(s.id)}
            >
              <div className="n">{s.name}</div>
              <div className="t">{s.tagline}</div>
              <div className="id">{s.id}</div>
            </div>
          ))}
        </div>
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
              onChange={(e) => setImageSize(e.target.value as ImageSize)}
            >
              {(['1K', '2K', '4K'] as ImageSize[]).map((s) => (
                <option key={s} value={s}>
                  {IMAGE_SIZE_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="hint">
          提示：先用 1K 出主写真确认像不像，确认后再用 2K 生成扩展图，省费用。
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn sec" onClick={exportTxt}>
            导出 TXT 制作包（提示词包）
          </button>
        </div>
      </div>

      {stage === 'input' && (
        <div className="card">
          <h2>第一阶段 · 生成主写真</h2>
          <button
            className="btn"
            disabled={busy || photos.length === 0}
            onClick={() =>
              setConfirm({
                kind: 'master',
                count: 1,
                inputImages: photos.length,
              })
            }
          >
            {busy ? '生成中…' : '生成主写真'}
          </button>
          {confirm?.kind === 'master' && (
            <div className="confirm">
              <div>
                本次将调用 Gemini 1 次，生成 1 张「{masterStyleName}」主写真。
              </div>
              <div>
                预估费用约 <b>{formatUSD(masterCost)}</b>
                （含 {photos.length} 张参考图输入）。确认后开始计费生成。
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn" onClick={runMaster} disabled={busy}>
                  确认并生成
                </button>
                <button
                  className="btn sec"
                  onClick={() => setConfirm(null)}
                  disabled={busy}
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {master && (
        <div className="card">
          <h2>主写真 · {masterStyleName}</h2>
          {master.status === 'generating' && <p>生成中，请稍候…</p>}
          {master.status === 'done' && master.data && (
            <>
              <img
                className="master"
                src={`data:${master.mimeType};base64,${master.data}`}
                alt="主写真"
              />
              <div
                className="row"
                style={{ marginTop: 10, flexWrap: 'wrap' }}
              >
                <button
                  className="btn small sec"
                  onClick={() =>
                    downloadOne(
                      `${identity.petName || 'pet'}-${master.styleId}.png`,
                      master.data!,
                      master.mimeType || 'image/png',
                    )
                  }
                >
                  下载主写真
                </button>
                <button
                  className="btn small sec"
                  onClick={() =>
                    setConfirm({
                      kind: 'master',
                      count: 1,
                      inputImages: photos.length,
                    })
                  }
                  disabled={busy}
                >
                  不满意，重新生成
                </button>
                <button
                  className="btn small"
                  onClick={() => setStage('extend')}
                >
                  满意，扩展其他风格 →
                </button>
              </div>
            </>
          )}
          {master.status === 'error' && (
            <p className="err">{master.error}</p>
          )}
        </div>
      )}

      {stage !== 'input' && master?.status === 'done' && (
        <div className="card">
          <h2>第二阶段 · 扩展其他风格</h2>
          <p className="hint">
            扩展时会把主写真图 + 主参考图一起传给模型，保持同一只宠物。每次调用出
            1 张图，按勾选风格数逐张生成。
          </p>
          <div className="styles">
            {STYLES.filter((s) => s.id !== masterStyle).map((s) => (
              <div
                key={s.id}
                className={`style ${
                  extendStyles.includes(s.id) ? 'sel' : ''
                }`}
                onClick={() =>
                  setExtendStyles((p) =>
                    p.includes(s.id)
                      ? p.filter((x) => x !== s.id)
                      : [...p, s.id].slice(0, 4),
                  )
                }
              >
                <div className="n">{s.name}</div>
                <div className="t">{s.tagline}</div>
                <div className="id">{s.id}</div>
              </div>
            ))}
          </div>
          <p className="hint">最多同时选 4 种风格。</p>
          <button
            className="btn"
            disabled={busy || extendStyles.length === 0}
            onClick={() =>
              setConfirm({
                kind: 'extend',
                count: extendStyles.length,
                inputImages: 2,
              })
            }
          >
            {busy ? '生成中…' : `生成扩展写真（${extendStyles.length} 张）`}
          </button>
          {confirm?.kind === 'extend' && (
            <div className="confirm">
              <div>
                本次将调用 Gemini {extendStyles.length} 次，生成{' '}
                {extendStyles.length} 张扩展写真。
              </div>
              <div>
                预估费用约 <b>{formatUSD(extendCost)}</b>。确认后开始逐张计费生成。
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn" onClick={runExtend} disabled={busy}>
                  确认并生成
                </button>
                <button
                  className="btn sec"
                  onClick={() => setConfirm(null)}
                  disabled={busy}
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div className="card">
          <h2>生成结果</h2>
          <div className="gallery">
            {results.map((r) => (
              <div key={r.id} className="gen">
                {r.status === 'done' && r.data ? (
                  <img
                    src={`data:${r.mimeType};base64,${r.data}`}
                    alt={r.styleId}
                  />
                ) : (
                  <div className="meta">
                    {r.status === 'generating'
                      ? '生成中…'
                      : `失败：${r.error}`}
                  </div>
                )}
                <div className="meta">
                  <div className="st">
                    {STYLES.find((s) => s.id === r.styleId)?.name} · {r.styleId}
                  </div>
                  {r.status === 'done' && r.data && (
                    <div className="row" style={{ marginTop: 6 }}>
                      <button
                        className="btn small sec"
                        onClick={() =>
                          downloadOne(
                            `${identity.petName || 'pet'}-${r.styleId}.png`,
                            r.data!,
                            r.mimeType || 'image/png',
                          )
                        }
                      >
                        下载
                      </button>
                      <button
                        className="btn small sec"
                        disabled={busy}
                        onClick={() =>
                          setConfirm({
                            kind: 'regen',
                            count: 1,
                            inputImages: 2,
                            styleId: r.styleId,
                            resultId: r.id,
                          })
                        }
                      >
                        重生成
                      </button>
                    </div>
                  )}
                  {r.status === 'error' && (
                    <button
                      className="btn small sec"
                      disabled={busy}
                      onClick={() =>
                        setConfirm({
                          kind: 'regen',
                          count: 1,
                          inputImages: 2,
                          styleId: r.styleId,
                          resultId: r.id,
                        })
                      }
                    >
                      重试
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {confirm?.kind === 'regen' && confirm.resultId && (
            <div className="confirm">
              <div>重新生成 1 张，预估费用约 {formatUSD(estimateBatchCost(1, imageSize, 2))}。</div>
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    regenOne(confirm.resultId!, confirm.styleId!)
                  }
                >
                  确认并重新生成
                </button>
                <button
                  className="btn sec"
                  onClick={() => setConfirm(null)}
                  disabled={busy}
                >
                  取消
                </button>
              </div>
            </div>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn sec" onClick={downloadAll}>
              全部下载
            </button>
          </div>
        </div>
      )}

      {error && <div className="err">{error}</div>}

      <div className="card">
        <h2>说明</h2>
        <details>
          <summary>费用与限制</summary>
          <p className="muted">
            模型：gemini-nano-banana-2.1。Interactions API 单次调用只生成 1
            张图。图像输出无免费 tier；1K 约 $0.0336/张，2K 约
            $0.0504/张，4K 约 $0.113/张，另有少量输入 token
            费用。AI 不能保证 100%
            还原宠物外貌，差异明显时请重新生成。所有生成图片带 SynthID 水印。
          </p>
        </details>
        <details>
          <summary>隐私</summary>
          <p className="muted">
            照片仅用于本次生成请求，浏览器不保存，服务器不落盘。客户照片不要用于其他订单或公开宣传。
          </p>
        </details>
      </div>
    </main>
  );
}
