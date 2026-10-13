import { getStyle, type StyleId } from './styles';

export interface IdentityCard {
  petName: string;
  breed: string;
  coat: string;
  markings: string;
  eyes: string;
  ears: string;
  nose: string;
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
  bodyType: '',
  specialMarks: '',
};

function identityLines(id: IdentityCard): string[] {
  const lines: string[] = [];
  const push = (label: string, v: string) => {
    if (v.trim()) lines.push(`- ${label}：${v.trim()}`);
  };
  push('名字', id.petName);
  push('品种', id.breed);
  push('毛色', id.coat);
  push('花纹分布', id.markings);
  push('眼睛', id.eyes);
  push('耳朵', id.ears);
  push('鼻子', id.nose);
  push('体型', id.bodyType);
  push('特殊标记', id.specialMarks);
  return lines;
}

/**
 * 生成提示词：参考图片 + 宠物身份特征 + 风格描述。
 * 身份一致性靠三点：把特征写进提示词、把主参考图作为输入、扩展阶段把主写真图也作为输入。
 */
export function buildPrompt(
  styleId: StyleId,
  identity: IdentityCard,
  stage: 'master' | 'extend',
): string {
  const style = getStyle(styleId);
  const lines = identityLines(identity);
  const identityBlock =
    lines.length > 0
      ? lines.join(
)
      : '- （未填写特征卡，请以参考照片为准）';

  const stageNote =
    stage === 'master'
      ? '这是本订单的主写真：请以第一张参考照片的宠物为唯一身份基准，生成一张高质量写真。'
      : '这是本订单的扩展写真：输入中包含同一宠物的主写真图，请以主写真图和参考照片共同确认宠物身份，保持与主写真相同的长相、毛色、花纹和眼睛，换一个新场景。';

  return [
    '请根据我上传的宠物参考照片，生成一张宠物写真图片。',
    '',
    '【身份特征，必须严格保留】',
    identityBlock,
    '要求：宠物长相不能走样，毛色和花纹位置不能变，眼睛颜色不能变，耳朵形状不能变，身体比例合理，照片质感真实。不要添加参考照片中不存在的花纹、饰品或第二只动物。',
    '',
    '【风格】',
    style.prompt,
    '',
    '【生成要求】',
    stageNote,
    '只输出图片，不要在画面里加任何文字、水印或边框。',
  ].join(
);
}

/** 负面约束（并入主提示词，Interactions API 无独立 negative prompt 字段） */
export const NEGATIVE_HINT =
  '禁止：改变毛色、改变眼睛颜色、改变耳朵形状、添加不存在的花纹、面部变形、画面文字、水印。';
