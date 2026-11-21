// Antigravity CLI 状态样本(构造样本:依据 Orca agent-state-rules/antigravity.json 与
// antigravity-text-composer.ts 的就绪证伪清单;真实采样(AGENT_SESSIONS_SAMPLE)到位后替换)
import type { AgentTrackerFixture } from './tracker-fixture'

// 就绪 composer:按 Orca 规则 composer_ready 的底四行(分隔行 / caret 行 / 分隔行 / 提示行)
const READY_COMPOSER = [
  '  Working directory: D:/demo-project',
  '',
  '  ──────────────────────────────────────────────────',
  '> ',
  '  ──────────────────────────────────────────────────',
  '  ? for shortcuts',
  ''
].join('\n')

export const antigravityFixture: AgentTrackerFixture = {
  agentId: 'antigravity',
  note:
    '构造样本,依据 Orca antigravity.json 规则 composer_ready(why:底四行的提示行 `? for shortcuts` 决定就绪;' +
    '该规则 answer 为 idle 且带 requiresQuiet)与 antigravity-text-composer.ts 的就绪证伪扫描' +
    '(`do you trust|sign in|select a model|collect usage|choose a theme|press enter to continue`,命中即非就绪)。' +
    '本引擎把「就绪画面已绘制」读作 working,静止达安静门槛后由地标+安静判 idle;证伪菜单在屏 = waiting。待真实采样替换。',
  samples: {
    // 用例 6 的输入:composer 就绪画面 → 信任菜单(菜单持有键盘)
    'trust-menu': {
      source:
        'Orca antigravity-text-composer.ts 就绪证伪扫描 `do you trust`(命中即有菜单占用键盘)+ 规则 composer_ready 的提示行地标',
      events: [
        { type: 'snapshot', atMs: 0, text: READY_COMPOSER },
        {
          type: 'snapshot',
          atMs: 1000,
          text: [
            READY_COMPOSER,
            '',
            '  Do you trust the files in this workspace?',
            '> 1. Yes, proceed',
            '  2. No, exit',
            ''
          ].join('\n')
        }
      ],
      checkpoints: [
        { atMs: 400, state: 'working' },
        { atMs: 1400, state: 'waiting' }
      ]
    }
  }
}
