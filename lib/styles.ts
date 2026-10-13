export type StyleId =
  | 'P01'
  | 'P02'
  | 'P03'
  | 'P04'
  | 'P05'
  | 'P06'
  | 'P07'
  | 'P08';

export interface PortraitStyle {
  id: StyleId;
  name: string;
  tagline: string;
  /** 风格模块描述，拼进生成提示词 */
  prompt: string;
}

export const STYLES: PortraitStyle[] = [
  {
    id: 'P01',
    name: '棚拍高级写真',
    tagline: '干净背景 · 影棚光',
    prompt:
      '专业摄影棚写真，纯色浅灰背景，柔和影棚光，宠物坐姿正面，杂志写真质感，毛发细节清晰',
  },
  {
    id: 'P02',
    name: '油画贵族写真',
    tagline: '古典油画 · 贵族礼服',
    prompt:
      '欧洲古典油画风格，宠物穿着深色贵族礼服，背景是城堡书房，厚重油画笔触，伦勃朗光线，庄重典雅',
  },
  {
    id: 'P03',
    name: '韩系奶油写真',
    tagline: '浅色低饱和 · 温柔',
    prompt:
      '韩系奶油风写真，浅色低饱和配色，柔光，干净米白背景，温柔治愈氛围，简约构图',
  },
  {
    id: 'P04',
    name: '花园梦幻写真',
    tagline: '自然光 · 花草虚化',
    prompt:
      '梦幻花园场景，自然光，背景花草柔和虚化，宠物坐在花丛中，清新治愈，春日氛围',
  },
  {
    id: 'P05',
    name: '电影感写真',
    tagline: '深色背景 · 轮廓光',
    prompt:
      '电影感写真，深色背景，轮廓光勾勒毛发边缘，氛围感强，电影海报质感，略带神秘感',
  },
  {
    id: 'P06',
    name: '太空主题写真',
    tagline: '宇航服 · 星空',
    prompt:
      '太空主题，宠物穿着白色宇航服，背景是浩瀚星空与地球，科幻电影海报质感',
  },
  {
    id: 'P07',
    name: 'Q版卡通写真',
    tagline: '大头小身 · 可爱',
    prompt:
      '日系Q版卡通风格，大头小身，圆润线条，明亮马卡龙配色，贴纸风格，可爱讨喜',
  },
  {
    id: 'P08',
    name: '水彩清新写真',
    tagline: '淡雅水彩 · 柔光',
    prompt:
      '淡雅水彩插画风，宠物坐在花丛中，柔光，治愈系插画，笔触轻盈，色彩清新',
  },
];

export function getStyle(id: StyleId): PortraitStyle {
  const found = STYLES.find((s) => s.id === id);
  if (!found) throw new Error(`未知风格: ${id}`);
  return found;
}
