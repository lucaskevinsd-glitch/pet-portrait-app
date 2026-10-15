/**
 * 场景参数选项。
 * 选「跟随风格默认」时场景由写真风格决定；选具体场景时，
 * 生成的提示词会明确要求以该场景为准，替换风格默认背景。
 */
export type SceneId =
  | 'auto'
  | 'studio'
  | 'garden'
  | 'home'
  | 'grass'
  | 'beach'
  | 'snow'
  | 'street';

export interface Scene {
  id: SceneId;
  name: string;
  /** 场景描述，拼进主提示词与场景提示词 */
  prompt: string;
}

export const SCENES: Scene[] = [
  {
    id: 'auto',
    name: '跟随风格默认',
    prompt: '',
  },
  {
    id: 'studio',
    name: '室内摄影棚',
    prompt: '室内摄影棚，纯色背景，无杂物，影棚布光',
  },
  {
    id: 'garden',
    name: '户外花园',
    prompt: '户外花园，背景花草柔和虚化，自然光，清新氛围',
  },
  {
    id: 'home',
    name: '居家客厅',
    prompt: '居家客厅，沙发与地毯，温馨生活气息，自然室内光',
  },
  {
    id: 'grass',
    name: '户外草地',
    prompt: '户外草地，绿色草坪，远处树木虚化，自然光',
  },
  {
    id: 'beach',
    name: '海边沙滩',
    prompt: '海边沙滩，蓝天与海面虚化，明亮日光，海风氛围',
  },
  {
    id: 'snow',
    name: '雪地',
    prompt: '雪地场景，白雪覆盖地面，冷色调光，纯净氛围',
  },
  {
    id: 'street',
    name: '城市街道',
    prompt: '城市街道，建筑与街道虚化，自然日光，生活气息',
  },
];

export function getScene(id: SceneId): Scene {
  const found = SCENES.find((s) => s.id === id);
  if (!found) throw new Error(`未知场景: ${id}`);
  return found;
}
