# AI 宠物写真 · 真实出图 Web 应用

上传宠物照片 → 填特征卡 → 选风格 → 通过 Google Gemini API（Nano Banana 2.1，模型 ID `gemini-nano-banana-2.1`）真实生成写真图片。两阶段流程：先生成 1 张主写真确认，再扩展其他风格。

## 功能

- 上传 1~5 张宠物照片（前端自动压缩到 1024px 内），点选主参考图
- 宠物特征卡（品种 / 毛色 / 花纹 / 眼睛 / 耳朵 / 鼻子 / 体型 / 特殊标记）
- 8 种写真风格：P01 棚拍高级、P02 油画贵族、P03 韩系奶油、P04 花园梦幻、P05 电影感、P06 太空主题、P07 Q 版卡通、P08 水彩清新
- 图片比例（1:1 / 3:4 / 4:3 / 9:16 / 16:9）、清晰度（1K / 2K / 4K）
- 生成前显示费用预估并需二次确认；单张下载 / 全部下载 / 重新生成 / TXT 制作包导出
- Interactions API 单次调用只生成 1 张图；扩展阶段把主写真图 + 主参考图一起传入，保持同一只宠物一致性

## 本地开发

```bash
npm install
cp .env.example .env.local   # 填入真实 Key（.env.local 已被 .gitignore 排除，绝不提交）
npm run dev                  # http://localhost:3000
```

## Vercel 部署

1. 把本仓库导入 Vercel（Framework Preset 选 Next.js，Build Command `npm run build`，Output Directory 默认）。
2. 在 Vercel 项目设置 → Settings → Environment Variables 中添加：
   - `GEMINI_API_KEY` = 你的 Gemini API Key（Production + Preview 都勾上）
   - 可选 `GEMINI_MODEL`（默认 `gemini-nano-banana-2.1`）
3. 重新部署（Redeploy）。**不要把 Key 写进 `vercel.json`、前端代码或任何提交里。**

注意：

- **没有配置 `GEMINI_API_KEY` 时应用不会在构建阶段崩溃**；访问生成接口时会返回 `CONFIG_MISSING` 错误提示。
- Vercel Hobby 计划函数超时上限为 10 秒，生成一张图通常需要 10~60 秒，超时会提示重试；正式使用建议 Pro 计划。
- Gemini API 图像输出**没有免费 tier**，Google Cloud 项目必须启用计费。费用参考：1K 约 $0.0336/张，2K 约 $0.0504/张，4K 约 $0.113/张，另有少量输入 token 费用。
- 每次生成都会计费：前端在每次生成前会显示预估费用并要求确认，不会自动连调。

## 密钥安全

- Key 只在 `app/api/generate/route.ts` 服务端经 `process.env.GEMINI_API_KEY` 读取，前端永远接触不到。
- `.env.example` 只有变量名和占位符；`.env.local` 等真实密钥文件已加入 `.gitignore`。
- 服务端不记录 Key、图片内容，只记录状态码与体积。
- 上传限制：仅 JPEG / PNG / WebP，单张解码后 ≤4MB，总计 ≤8MB；超限返回 400。

## 错误码

| 代码 | 含义 |
|---|---|
| `CONFIG_MISSING` | 服务端未配置 `GEMINI_API_KEY` |
| `INVALID_REQUEST` | 参数/图片格式或大小不合法 |
| `INVALID_KEY` | Key 无效或未启用计费（401/403） |
| `QUOTA_EXCEEDED` | 额度不足或请求过于频繁（429） |
| `TIMEOUT` | 上游 55 秒未响应 |
| `NO_IMAGE` | 上游未返回图片（可能被内容过滤或提示词未被识别为生图请求） |
| `UPSTREAM_ERROR` | 其他上游错误 |

## 测试说明

- 真实出图测试需要配置真实 Key 后才能做；未真实调用前不宣称出图已通过测试。
- 无 Key 状态下可验证：页面构建、移动端布局、上传、主参考选择、风格切换、缺 Key 报错、请求构造。
