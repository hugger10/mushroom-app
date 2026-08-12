/**
 * 随机文本生成器：1~100 字符，混合常用汉字 + ASCII 字母数字 + 偶发 emoji。
 * 长度分布偏短：60% [1,20] / 30% [21,60] / 10% [61,100]。
 */

const ASCII =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ,.!?";
// 常用汉字范围 0x4E00 ~ 0x9FA5（约 2 万个）；为提升可读性，挑一段常用字
const CJK_START = 0x4e00;
const CJK_END = 0x9fa5;

const EMOJIS = [
  "😀",
  "😂",
  "😊",
  "😍",
  "🤔",
  "👍",
  "🙏",
  "❤️",
  "🔥",
  "🥲",
  "😅",
  "🎉",
  "✨",
  "👀",
  "💯"
];

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickLength(min: number, max: number): number {
  const r = Math.random();
  if (r < 0.6) return randInt(min, Math.min(20, max));
  if (r < 0.9) return randInt(Math.max(min, 21), Math.min(60, max));
  return randInt(Math.max(min, 61), max);
}

function randomChar(): string {
  // 70% 中文 / 25% ASCII / 5% emoji
  const r = Math.random();
  if (r < 0.7) {
    return String.fromCharCode(randInt(CJK_START, CJK_END));
  }
  if (r < 0.95) {
    return ASCII.charAt(Math.floor(Math.random() * ASCII.length));
  }
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
}

export interface RandomTextOptions {
  min?: number;
  max?: number;
  /** 群聊场景下 @ 提及的候选成员（昵称列表），有 5% 概率 @ 一人 */
  mentionCandidates?: string[];
}

export interface RandomTextResult {
  text: string;
  mentionNicknames: string[];
}

export function generateRandomText(
  options: RandomTextOptions = {}
): RandomTextResult {
  const min = options.min ?? 1;
  const max = options.max ?? 100;
  const targetLen = pickLength(min, max);

  let text = "";
  while (text.length < targetLen) {
    text += randomChar();
  }
  if (text.length > targetLen) {
    text = text.slice(0, targetLen);
  }

  // 5% 概率叠加 1~2 个 emoji 尾巴（可能导致超 max 几字符，此时再裁剪一次）
  if (Math.random() < 0.15) {
    const tailCount = randInt(1, 2);
    let tail = "";
    for (let i = 0; i < tailCount; i += 1) {
      tail += EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    }
    text = (text + tail).slice(0, max);
  }

  // 群聊 @ 提及（5%）
  const mentionNicknames: string[] = [];
  const candidates = options.mentionCandidates ?? [];
  if (candidates.length > 0 && Math.random() < 0.05) {
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    const prefix = `@${target} `;
    text = (prefix + text).slice(0, Math.max(max, prefix.length + 1));
    mentionNicknames.push(target);
  }

  if (text.length === 0) text = randomChar();
  return { text, mentionNicknames };
}

/** 生成 2~10 字符的昵称（中英文混合） */
export function generateRandomNickname(): string {
  const len = randInt(2, 10);
  let s = "";
  while (s.length < len) {
    // 昵称里不放 emoji
    const r = Math.random();
    if (r < 0.7) {
      s += String.fromCharCode(randInt(CJK_START, CJK_END));
    } else {
      const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
      s += letters.charAt(Math.floor(Math.random() * letters.length));
    }
  }
  return s.slice(0, len);
}
