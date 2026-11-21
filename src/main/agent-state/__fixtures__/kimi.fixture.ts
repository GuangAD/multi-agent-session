// Kimi Code CLI 状态样本(构造样本:降级预案——brief 第 5 节「最坏只做有输出=干活、退出=退出」;
// 真实采样(AGENT_SESSIONS_SAMPLE)到位后替换,若采到可靠屏幕信号再升级为非降级规则)
import type { AgentTrackerFixture } from './tracker-fixture'

export const kimiFixture: AgentTrackerFixture = {
  agentId: 'kimi',
  note:
    '构造样本,依据 brief 第 5 节降级预案与 plan M3「kimi 降级预案:看屏幕识别 kimi 状态无公开先例(Orca 亦无其屏幕规则),' +
    '最坏只做「最近输出 → working、进程退出 → exited」——本引擎的降级档把静默达门槛读作 idle(等待输入并入相邻态)。' +
    '待真实采样替换。',
  samples: {
    // 用例 7 的输入:任意输出
    'output-working': {
      source: 'brief 第 5 节降级预案:有输出 = working',
      events: [{ type: 'bytes', atMs: 0, chunk: 'Kimi Code CLI 1.0.0\r\n\r\n> ' }],
      checkpoints: [{ atMs: 400, state: 'working' }]
    },
    // 用例 8 的输入:输出后静默达门槛
    'quiet-idle': {
      source: 'brief 第 5 节降级预案:静默达门槛 = idle(idleQuietMs 缺省 2000)',
      events: [
        { type: 'bytes', atMs: 0, chunk: 'reading src/main/index.ts\r\n' },
        { type: 'bytes', atMs: 800, chunk: 'done.\r\n' }
      ],
      checkpoints: [
        { atMs: 400, state: 'working' },
        { atMs: 1200, state: 'working' },
        { atMs: 3400, state: 'idle' }
      ]
    }
  }
}
