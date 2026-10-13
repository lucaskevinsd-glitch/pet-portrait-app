/**
 * 计费估算（基于 Google Gemini API 官方定价页，2026-10-09 更新）。
 * 图像输出按 token 计费：1K 图 1120 token，2K 图 1680 token，4K 图 3780 token，
 * 图像输出单价 $30 / 1M token。输入参考图每张 1120 token，输入单价 $1.50 / 1M token。
 * 实际账单还包含少量文本/thinking token，本估算仅供生成前确认参考。
 */

export type ImageSize = '1K' | '2K' | '4K';

export const IMAGE_OUTPUT_TOKENS: Record<ImageSize, number> = {
  '1K': 1120,
  '2K': 1680,
  '4K': 3780,
};

export const IMAGE_OUTPUT_PRICE_PER_M = 30; // USD per 1M tokens
export const INPUT_PRICE_PER_M = 1.5; // USD per 1M tokens
export const INPUT_TOKENS_PER_IMAGE = 1120;

export const IMAGE_SIZE_LABEL: Record<ImageSize, string> = {
  '1K': '1K（1024px，草稿/预览）',
  '2K': '2K（2048px，交付推荐）',
  '4K': '4K（4096px，高清大图）',
};

export function pricePerImage(size: ImageSize): number {
  return (IMAGE_OUTPUT_TOKENS[size] * IMAGE_OUTPUT_PRICE_PER_M) / 1_000_000;
}

/** 估算一次生成批次的总费用（美元）。inputImages = 本次调用传入的参考图张数 */
export function estimateBatchCost(
  imageCount: number,
  size: ImageSize,
  inputImages: number,
): number {
  const imageCost = pricePerImage(size) * imageCount;
  const inputCost =
    (INPUT_TOKENS_PER_IMAGE * inputImages * INPUT_PRICE_PER_M) / 1_000_000;
  return imageCost + inputCost;
}

export function formatUSD(n: number): string {
  return `$${n.toFixed(4)}`;
}
