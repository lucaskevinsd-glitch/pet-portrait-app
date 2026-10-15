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
  /** 风格核心描述，拼进主提示词的风格部分 */
  prompt: string;
  /** 光线与色彩描述，拼进主提示词 */
  lighting: string;
  /** 构图描述，拼进主提示词 */
  composition: string;
  /** 该风格专属的负面提示词（与通用负面词拼接） */
  negative: string;
}

export const STYLES: PortraitStyle[] = [
  {
    id: 'P01',
    name: '棚拍高级写真',
    tagline: '干净背景 · 影棚光',
    prompt: '专业摄影棚写真，宠物坐姿正面，杂志写真质感',
    lighting: '柔和可控光线，主光柔和均匀，辅光补阴影',
    composition: '主体居中，半身特写或全身坐姿，留白均匀，视角与宠物眼睛平齐',
    negative: '杂乱环境，强阴影，过度曝光，模糊',
  },
  {
    id: 'P02',
    name: '油画贵族写真',
    tagline: '古典油画 · 贵族礼服',
    prompt: '欧洲古典油画风格，宠物穿着深色贵族礼服，背景是城堡书房，厚重油画笔触，庄重典雅',
    lighting: '伦勃朗光线，明暗对比柔和，暖色调油画光感',
    composition: '古典肖像构图，主体居中偏上，半身像',
    negative: '照片感，现代服装，卡通风格',
  },
  {
    id: 'P03',
    name: '韩系奶油写真',
    tagline: '浅色低饱和 · 温柔',
    prompt: '韩系奶油风写真，浅色低饱和配色，温柔治愈氛围，简约构图，干净米白背景',
    lighting: '明亮柔光，低对比，高曝光感，奶油色调',
    composition: '简约构图，大量留白，主体居中',
    negative: '高饱和，强对比，杂乱道具',
  },
  {
    id: 'P04',
    name: '花园梦幻写真',
    tagline: '自然光 · 花草虚化',
    prompt: '梦幻花园场景，宠物坐在花丛中，清新治愈，春日氛围',
    lighting: '柔和自然光，色彩清新明亮',
    composition: '主体居中，前景柔和虚化，背景柔和虚化，纵深感',
    negative: '阴暗色调，枯萎植物',
  },
  {
    id: 'P05',
    name: '电影感写真',
    tagline: '深色背景 · 轮廓光',
    prompt: '电影感写真，深色背景，氛围感强，电影海报质感，略带神秘感',
    lighting: '轮廓光勾勒毛发边缘，低调光影，明暗对比明显',
    composition: '电影海报式构图，主体偏侧，三分法，留白营造氛围',
    negative: '高饱和，卡通风格，杂乱背景',
  },
  {
    id: 'P06',
    name: '太空主题写真',
    tagline: '宇航服 · 星空',
    prompt: '太空主题，宠物穿着白色宇航服，背景是浩瀚星空与地球，科幻电影海报质感',
    lighting: '冷色调光，宇航服高光',
    composition: '主体居中，宇航服完整呈现，纵深感强',
    negative: '日常服装，写实宠物棚拍',
  },
  {
    id: 'P07',
    name: 'Q版卡通写真',
    tagline: '大头小身 · 可爱',
    prompt: '日系Q版卡通风格，大头小身，圆润线条，明亮马卡龙配色，贴纸风格，可爱讨喜',
    lighting: '明亮均匀的卡通光，无真实阴影，色彩鲜明',
    composition: '主体居中，大头占比突出，贴纸式留白，简洁背景',
    negative: '写实风格，真实照片质感，恐怖，阴暗色调',
  },
  {
    id: 'P08',
    name: '水彩清新写真',
    tagline: '淡雅水彩 · 柔光',
    prompt: '淡雅水彩插画风，宠物坐在花丛中，治愈系插画，笔触轻盈',
    lighting: '柔光，水彩晕染感，淡雅清新色调',
    composition: '插画式构图，主体居中，留白自然',
    negative: '照片感，厚重油画，写实阴影，高饱和',
  },
];

export function getStyle(id: StyleId): PortraitStyle {
  const found = STYLES.find((s) => s.id === id);
  if (!found) throw new Error(`未知风格: ${id}`);
  return found;
}
