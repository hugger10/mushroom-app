/**
 * 文字消息语料生成器：80~120 条中文短句 + 长度加权抽样 + 拼接 + 偶发 emoji/@提及。
 * 仅用于测试场景，避免敏感内容。
 */

const TINY: string[] = [
  "在",
  "在吗",
  "在的",
  "好",
  "好的",
  "好嘞",
  "嗯",
  "嗯嗯",
  "哈哈",
  "笑死",
  "OK",
  "ok",
  "收到",
  "收到 👍",
  "懂了",
  "明白",
  "稍等",
  "马上",
  "?",
  "啥",
  "👍",
  "❤️",
  "🤔",
  "🥲",
  "🙏"
];

const SHORT: string[] = [
  "刚发你了，看下",
  "这个我下午改一下",
  "等会儿一起吃饭？",
  "晚上加班吗",
  "周报记得提交",
  "会议推迟到下午 3 点",
  "我先去开个会",
  "你那边的接口还没好",
  "需求文档发我下",
  "新版本已经发了",
  "服务挂了吗，我这边请求超时",
  "明天还要加班吗",
  "这个 bug 我看下",
  "已经修好了，重新拉一下代码",
  "你看下这个 PR",
  "我同意你的方案",
  "等一下，我再确认下",
  "这个需求改动有点大",
  "我先去吃饭，回来再聊",
  "已经合到主分支了",
  "记得做一下测试",
  "我推到测试环境了",
  "今晚上线吗",
  "回头我整理个文档发你",
  "再约下周一开会吧",
  "这个用例没覆盖到",
  "代码 review 通过了",
  "我们要不要拉个会",
  "你的电脑重启下试试",
  "刚才的版本回滚了",
  "周五前能搞完吗",
  "我把这块改成异步了",
  "这边已经测过没问题",
  "数据库需要加个索引"
];

const MEDIUM: string[] = [
  "刚才看了一下日志，那个报错的接口偶尔会超时，应该是网络问题，我加了下重试逻辑",
  "今天上午客户提了几个需求改动，我整理一下贴在群里，大家先看看哪些可以排到这个迭代里",
  "服务端那个推送服务的连接池满了，导致部分消息延迟，现在已经临时调大了，回头要看下根因",
  "刚才看了下数据库慢查询，message 表那个会话查询占了 70% 的时间，需要重新设计下索引",
  "前端这边新版本下周三发布，麻烦后端的接口在周一前提前部署到预发环境方便联调",
  "建议把这个公共组件抽出来放到 shared 包里，目前 web/electron/mobile 三端都在重复实现",
  "刚才的会议结论我整理一下：1) 优先做支付链路 2) 性能优化排第二期 3) 后台管理下个月再说",
  "你帮忙看下 build pipeline 为什么挂了，看错误像是 node 版本不对，本地是 22 但 CI 用了 18",
  "数据库主从同步延迟今天又抖了一下，DBA 那边在排查，业务层先注意下读一致性问题",
  "新接入的群聊功能压测发现，超过 200 人同时发消息会出现明显的延迟，需要做下削峰策略"
];

const LONG: string[] = [
  "刚才和产品对了一下需求，详细说一下：用户在群聊里 @ 某人时需要单独高亮，并且不进群的人也要能看到这条消息的预览。这个改动涉及前端的渲染、后端的推送以及未读计数三个模块，我估计要做两周左右。如果可以的话，我们今天下午拉一个会，把任务拆一拆排进下一个迭代。",
  "今天线上出了一个比较严重的问题：在 16:20 左右，部分用户反馈消息发送后接收方收不到。我看了一下日志，原因是 outbox worker 的一个分片卡死了，导致 chat.message.deliver 事件堆积。临时方案是重启了 worker 实例，事件已经重新派发完毕。后续需要给 worker 加上心跳检测和自动重启机制，防止再次出现这种情况。",
  "关于群消息的未读计数方案，我研究了一下行业内常见的几种实现：方案 A 是为每个用户都维护一份未读计数，写放大严重；方案 B 是只维护最大 sequence，客户端做差值；方案 C 是基于 read receipt 的混合方案。综合考虑写入性能和实时性，我倾向于方案 B，配合服务端推送的 last_read 通知客户端做增量更新。",
  "刚刚和运维同步了下机房迁移的进度，预计下周末窗口期凌晨 2 点到 6 点。期间需要做的事情包括：把 Redis 数据导出再导入新集群、PostgreSQL 主从切换、MinIO 对象存储 bucket 迁移、以及最后的 DNS 切换。整个过程预计停服 30 分钟左右，请大家提前在群里做好通知，避免有用户在凌晨上传大文件被中断。"
];

interface CategoryConfig {
  pool: string[];
  weight: number;
}

const CATEGORIES: CategoryConfig[] = [
  { pool: TINY, weight: 30 },
  { pool: SHORT, weight: 35 },
  { pool: MEDIUM, weight: 25 },
  { pool: LONG, weight: 10 }
];

const TOTAL_WEIGHT = CATEGORIES.reduce((sum, c) => sum + c.weight, 0);

const EMOJI_TAIL = ["", "", "", "", " 😄", " 👍", " 🙏", " 🥲", " 🔥", " ❤️"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickCategory(): string[] {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const c of CATEGORIES) {
    r -= c.weight;
    if (r <= 0) return c.pool;
  }
  return CATEGORIES[CATEGORIES.length - 1].pool;
}

export interface GenerateOptions {
  /** 群聊场景下 @ 提及的候选成员（昵称列表） */
  mentionCandidates?: string[];
}

export interface GeneratedText {
  text: string;
  mentions: Array<{ user_id: number; nickname: string }>;
}

/**
 * 生成一条文字消息内容（仅 text，不含 mention 用户 id 映射；调用者按需补齐）。
 */
export function generateText(options: GenerateOptions = {}): {
  text: string;
  /** 选中的待 @ 昵称列表（不含 user_id；由上层补齐） */
  mentionNicknames: string[];
} {
  let body = pick(pickCategory());

  // 20% 概率拼接第二段，5% 概率三段
  const r = Math.random();
  if (r < 0.05) {
    body = `${body} ${pick(pickCategory())} ${pick(pickCategory())}`;
  } else if (r < 0.25) {
    body = `${body} ${pick(pickCategory())}`;
  }

  // 5% 加 emoji 串
  if (Math.random() < 0.05) {
    body = `${body}${pick(EMOJI_TAIL)}${pick(EMOJI_TAIL)}`;
  }

  // 群聊场景：5% 概率加 @
  const mentionNicknames: string[] = [];
  const candidates = options.mentionCandidates ?? [];
  if (candidates.length > 0 && Math.random() < 0.05) {
    const target = pick(candidates);
    body = `@${target} ${body}`;
    mentionNicknames.push(target);
  }

  return { text: body, mentionNicknames };
}
