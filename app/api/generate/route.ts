import { NextRequest, NextResponse } from 'next/server';

/**
 * 服务端图像生成路由。
 * - Gemini API Key 只从服务端环境变量 GEMINI_API_KEY 读取，前端永远接触不到。
 * - 本文件不写任何密钥、不打任何含密钥的日志。
 * - Vercel Hobby 函数请求体上限约 4.5MB，前端上传前会先压缩照片到 1024px 内。
 */

export const runtime = 'nodejs';
// 注意：Vercel Hobby 计划函数超时上限为 10 秒，Pro 可更长。
// 生成一张图通常需要 10~60 秒；超时会在前端提示用户重试或升级计划。
const UPSTREAM_TIMEOUT_MS = 55_000;
const MODEL = process.env.GEMINI_MODEL || 'gemini-nano-banana-2.1';
const API_URL =
  'https://generativelanguage.googleapis.com/v1beta/interactions';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
const ASPECT_RATIOS = new Set([
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
  '1:4',
  '4:1',
  '1:8',
  '8:1',
  '9:21',
]);
const IMAGE_SIZES = new Set(['1K', '2K', '4K']);
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 单张解码后上限 4MB
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

type ApiError = { ok: false; code: string; message: string };

function err(code: string, message: string, status: number) {
  return NextResponse.json<ApiError>({ ok: false, code, message }, { status });
}

interface InputImage {
  data: string;
  mimeType: string;
}

function approxDecodedBytes(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return err(
      'CONFIG_MISSING',
      '服务端未配置 GEMINI_API_KEY。请在 Vercel 项目设置 → Environment Variables 中添加 GEMINI_API_KEY 后重新部署。',
      500,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err('INVALID_REQUEST', '请求体不是合法 JSON。', 400);
  }

  const b = body as {
    prompt?: unknown;
    images?: unknown;
    aspectRatio?: unknown;
    imageSize?: unknown;
  };

  if (typeof b.prompt !== 'string' || b.prompt.trim().length === 0) {
    return err('INVALID_REQUEST', '缺少提示词 prompt。', 400);
  }
  if (b.prompt.length > 8000) {
    return err('INVALID_REQUEST', '提示词过长（上限 8000 字符）。', 400);
  }
  if (!Array.isArray(b.images) || b.images.length === 0) {
    return err('INVALID_REQUEST', '至少上传 1 张参考照片。', 400);
  }
  if (b.images.length > MAX_IMAGES) {
    return err(
      'INVALID_REQUEST',
      `参考照片最多 ${MAX_IMAGES} 张。`,
      400,
    );
  }
  const aspectRatio =
    typeof b.aspectRatio === 'string' && ASPECT_RATIOS.has(b.aspectRatio)
      ? b.aspectRatio
      : '1:1';
  const imageSize =
    typeof b.imageSize === 'string' && IMAGE_SIZES.has(b.imageSize)
      ? b.imageSize
      : '1K';

  const images: InputImage[] = [];
  let totalBytes = 0;
  for (const item of b.images) {
    const im = item as { data?: unknown; mimeType?: unknown };
    if (typeof im.data !== 'string' || typeof im.mimeType !== 'string') {
      return err('INVALID_REQUEST', '参考照片格式错误。', 400);
    }
    if (!ALLOWED_MIME.has(im.mimeType)) {
      return err(
        'INVALID_REQUEST',
        `不支持的图片类型 ${im.mimeType}，请用 JPEG / PNG / WebP。`,
        400,
      );
    }
    const bytes = approxDecodedBytes(im.data);
    if (bytes > MAX_IMAGE_BYTES) {
      return err(
        'INVALID_REQUEST',
        '单张参考照片超过 4MB，请先压缩后再上传。',
        400,
      );
    }
    totalBytes += bytes;
    images.push({ data: im.data, mimeType: im.mimeType });
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return err('INVALID_REQUEST', '参考照片总大小超过 8MB。', 400);
  }

  // 构造 Interactions API 请求：文本 + 多张参考图 + 输出格式
  const input: Array<Record<string, unknown>> = [
    { type: 'text', text: b.prompt },
    ...images.map((im) => ({
      type: 'image',
      data: im.data,
      mime_type: im.mimeType,
    })),
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        input,
        response_format: {
          type: 'image',
          aspect_ratio: aspectRatio,
          image_size: imageSize,
        },
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === 'AbortError') {
      return err(
        'TIMEOUT',
        'Gemini API 响应超时（55 秒），请重试。Vercel Hobby 计划函数上限 10 秒，频繁超时请考虑升级 Pro。',
        504,
      );
    }
    return err('UPSTREAM_ERROR', '无法连接 Gemini API，请检查网络后重试。', 502);
  }
  clearTimeout(timer);

  // 只记录状态码与体积，绝不记录密钥或图片内容
  console.log(
    `[generate] upstream status=${upstream.status} images=${images.length} aspect=${aspectRatio} size=${imageSize}`,
  );

  if (!upstream.ok) {
    if (upstream.status === 400) {
      return err(
        'INVALID_REQUEST',
        'Gemini API 拒绝了本次请求（400），可能是图片格式或参数问题。',
        400,
      );
    }
    if (upstream.status === 401 || upstream.status === 403) {
      return err(
        'INVALID_KEY',
        'Gemini API Key 无效或未启用计费（401/403）。请检查 Vercel 环境变量 GEMINI_API_KEY，并确认 Google Cloud 项目已启用计费。',
        502,
      );
    }
    if (upstream.status === 429) {
      return err(
        'QUOTA_EXCEEDED',
        'Gemini API 额度不足或请求过于频繁（429），请稍后再试。',
        429,
      );
    }
    return err(
      'UPSTREAM_ERROR',
      `Gemini API 返回错误（${upstream.status}），请稍后重试。`,
      502,
    );
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return err('UPSTREAM_ERROR', 'Gemini API 返回了无法解析的响应。', 502);
  }

  const p = payload as {
    interaction?: {
      output_image?: { data?: unknown; mime_type?: unknown };
      outputs?: Array<{ type?: unknown; data?: unknown; mime_type?: unknown }>;
      usage_metadata?: unknown;
    };
    output_image?: { data?: unknown; mime_type?: unknown };
  };
  type InteractionLike = NonNullable<typeof p.interaction> & {
    output_image?: { data?: unknown; mime_type?: unknown };
  };
  const interaction = (p.interaction ?? p) as InteractionLike;
  let data: unknown = interaction.output_image?.data;
  let mimeType: unknown = interaction.output_image?.mime_type;
  if (typeof data !== 'string') {
    // 兜底：从 outputs 数组中找最后一张图片块
    const blocks = interaction.outputs;
    if (Array.isArray(blocks)) {
      const imgBlock = [...blocks]
        .reverse()
        .find((x) => x?.type === 'image' && typeof x?.data === 'string');
      if (imgBlock) {
        data = imgBlock.data;
        mimeType = imgBlock.mime_type ?? 'image/png';
      }
    }
  }
  if (typeof data !== 'string' || data.length === 0) {
    return err(
      'NO_IMAGE',
      'Gemini API 未返回图片（可能被内容过滤或提示词未被识别为生图请求），请调整提示词后重试。',
      502,
    );
  }

  return NextResponse.json({
    ok: true,
    image: {
      data,
      mimeType: typeof mimeType === 'string' ? mimeType : 'image/png',
    },
    usage: interaction.usage_metadata ?? null,
  });
}

export async function GET() {
  return err('METHOD_NOT_ALLOWED', '请使用 POST 调用本接口。', 405);
}
