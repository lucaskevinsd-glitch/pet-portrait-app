import { getStyle, type StyleId } from './styles';
import { getScene, type SceneId } from './scenes';

/**
 * 提示词全部由本地模板组装，不调用任何模型 API。
 * 关键规则：只写用户填写的特征；用户没填的字段不编造、不给默认值，
 * 一律要求生图工具以参考照片为准。
 */

export interface IdentityCard {
  petName: string;
  breed: string;
  coat: string;
  markings: string;
  eyes: string;
  ears: string;
  nose: string;
  /** 脸型，如：圆脸、尖脸、方脸 */
  faceShape: string;
  bodyType: string;
  specialMarks: string;
}

export const EMPTY_IDENTITY: IdentityCard = {
  petName: '',
  breed: '',
  coat: '',
  markings: '',
  eyes: '',
  ears: '',
  nose: '',
  faceShape: '',
  bodyType: '',
  specialMarks: '',
};

export interface PromptOptions {
  aspectRatio: string;
  imageSize: string;
  sceneId: SceneId;
}

export interface PromptSet {
  /** 主提示词：身份锁定 + 主体构图 + 场景 + 光线 + 细节 + 输出要求 + 防走样约束 */
  main: string;
  /** 负面提示词：通用防走样约束 + 该风格专属负面词 */
  negative: string;
  /** 场景提示词：可单独复制，也可替换主提示词里的场景部分 */
  scene: string;
  /** 使用说明：如何在 Gemini 等生图工具里使用这套提示词 */
  usage: string;
}

const ASPECT_RATIOS = ['1:1', '3:4', '4:3', '4:5', '9:16', '16:9'];
const IMAGE_SIZES = ['1K', '2K', '4K'];
const MAX_FIELD_LEN = 200;

/** 清理单个用户输入：去多余空白、截断超长内容，防止破坏提示词结构 */
function clean(v: string): string {
  return v.replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD_LEN);
}

function identityLines(id: IdentityCard): string[] {
  const lines: string[] = [];
  const push = (label: string, v: string) => {
    const c = clean(v);
    if (c) lines.push(`- ${label}：${c}`);
  };
  push('名字', id.petName);
  push('品种', id.breed);
  push('毛色', id.coat);
  push('花纹分布', id.markings);
  push('眼睛', id.eyes);
  push('耳朵', id.ears);
  push('鼻子', id.nose);
  push('脸型', id.faceShape);
  push('体型', id.bodyType);
  push('特殊标记', id.specialMarks);
  return lines;
}

/** 通用负面约束：防止宠物身份发生变化 */
const BASE_NEGATIVE =
  '改变毛色，改变眼睛颜色，改变耳朵形状，改变脸型，改变身体比例，添加不存在的花纹，添加不存在的饰品，出现第二只动物，面部变形，五官错位，肢体畸形，画面文字，水印，边框，模糊，低清';

const USAGE = [
  '使用方法：',
  '1. 在 Gemini（或你常用的生图工具）中上传 1 张主参考照片（建议最清晰的正脸照），可再附 1～4 张辅助照片。',
  '2. 把「主提示词」粘贴进去。如果工具支持单独的负面提示词栏位，把「负面提示词」填到对应栏位；不支持时，把负面提示词接在主提示词后面即可。',
  '3. 「场景提示词」可单独使用，也可用来替换主提示词里的场景部分。',
  '4. 生成后对照原照片检查：毛色、花纹、眼睛、耳朵、脸型、身体比例。发现走样就重新生成，或先把特征卡填得更具体，再重新生成提示词。',
  '注意：本网站只生成提示词，不会分析你的照片，也不会把照片上传到任何服务器。提示词里的特征全部来自你填写的特征卡；没填的特征请以参考照片为准，不要让生图工具自行编造。',
].join(
);

export function buildPromptSet(
  styleId: StyleId,
  identity: IdentityCard,
  options: PromptOptions,
): PromptSet {
  const style = getStyle(styleId);
  const scene = getScene(options.sceneId);
  const aspect = ASPECT_RATIOS.includes(options.aspectRatio)
    ? options.aspectRatio
    : '1:1';
  const size = IMAGE_SIZES.includes(options.imageSize) ? options.imageSize : '1K';

  const lines = identityLines(identity);
  const identityBlock =
    lines.length > 0
      ? lines.join(
)
      : '（未填写特征卡：请严格以参考照片为准，不要自行补充或编造任何宠物特征。）';

  const sceneBlock =
    scene.id === 'auto'
      ? `场景跟随风格：${style.prompt}。`
      : `场景：${scene.prompt}（以此场景为准，替换风格默认背景）。`;

  const main = [
    '请根据我上传的宠物参考照片，生成一张宠物写真。参考照片中的宠物是唯一主体。',
    '',
    '## 身份锁定（优先级最高）',
    identityBlock,
    '以上特征必须与参考照片完全一致；任何风格、场景描述都不得改变它们。毛色、花纹位置、眼睛颜色、耳朵形状、脸型、身体比例必须与参考照片一致，不得美化、不得走样。',
    '',
    '## 主体与构图',
    `主体为参考照片中的宠物，保持自然姿态。${style.composition}。`,
    '',
    '## 场景',
    sceneBlock,
    '',
    '## 光线与色彩',
    `${style.lighting}。`,
    '',
    '## 毛发与面部细节',
    '毛发根根分明，有自然光泽和层次；眼睛明亮有神，眼神自然；鼻子、胡须等面部细节清晰自然。',
    '',
    '## 输出要求',
    `画面比例 ${aspect}，清晰度 ${size}，高清画质，细节锐利。只输出图片，不要在画面里加任何文字、水印、边框或签名。`,
    '',
    '## 防走样约束',
    '不要改变宠物身份特征；不要添加参考照片中不存在的花纹、饰品或第二只动物；不要改变脸型和身体比例。',
  ].join(
);

  const negative = `${BASE_NEGATIVE}，${style.negative}`;
  const scenePrompt =
    scene.id === 'auto'
      ? `场景（跟随风格「${style.name}」）：${style.prompt}。`
      : `场景：${scene.prompt}。`;

  return { main, negative, scene: scenePrompt, usage: USAGE };
}
