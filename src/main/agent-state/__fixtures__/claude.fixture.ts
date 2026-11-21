// Claude Code 状态样本(构造样本:依据 Orca agent-state-rules/claude.json 的锚点 why;
// 真实采样(AGENT_SESSIONS_SAMPLE)到位后替换,替换时保持 checkpoints 的人工标注口径)
import type { AgentTrackerFixture } from './tracker-fixture'

export const claudeFixture: AgentTrackerFixture = {
  agentId: 'claude',
  note:
    '构造样本,依据 Orca claude.json:锚点 idle_title_glyph(why:标题静止带 `✳` 前缀,「a working title carries a spinner instead」)、' +
    '锚点 idle_title_ascii(why:`* ` 静止、`. ` 干活)与规则 idle_title(why:shell auto-title 从启动起就写裸名,`a bare name counts only once quiet`)。' +
    '待真实采样替换。',
  samples: {
    // 用例 1 的输入:干活标题(spinner 符号在标题里)
    'working-title': {
      source: 'Orca claude.json idle_title_glyph why「a working title carries a spinner instead」',
      events: [
        { type: 'title', atMs: 0, title: '⠋ Claude Code' },
        { type: 'title', atMs: 500, title: '⠙ Claude Code' }
      ],
      checkpoints: [
        { atMs: 400, state: 'working' },
        { atMs: 900, state: 'working' }
      ]
    },
    // 用例 2 的输入:先干活,标题退回裸名(shell auto-title),安静门槛过后才算 idle
    'plain-title-quiet': {
      source:
        'Orca claude.json idle_title why「a shell auto-title names it from launch, over the workspace-trust dialog or a busy turn alike, so a bare name counts only once quiet (#6011)」',
      quietMs: 1200,
      events: [
        { type: 'title', atMs: 0, title: '⠋ Claude Code' },
        { type: 'title', atMs: 1000, title: 'claude' }
      ],
      checkpoints: [
        { atMs: 400, state: 'working' },
        { atMs: 1400, state: 'working' },
        { atMs: 2600, state: 'idle' }
      ]
    }
  }
}
