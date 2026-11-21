// Claude Code 定义(brief 第 5 节固定清单)
// 状态规则初版照抄 Orca agent-state-rules/claude.json 的信号要点;规则引擎 T5 落地,此处只提供数据。
import type { AgentDefinition } from '../../../shared/agents'
import { scanClaude } from '../../session-store/session-import/claude'

export const claudeAgent: AgentDefinition = {
  id: 'claude',
  name: 'Claude Code',
  command: 'claude',
  icon: 'C',
  state: {
    title: {
      working: [
        // Why: Orca json 无 working 标题正则;初版取 braille spinner 区间(承 Orca claude.json 锚点 idle_title_glyph 的 why:「a working title carries a spinner instead」),T5 采样校准。
        /[⠋-⣿]/
      ],
      idle: [
        // Why: Orca claude.json 锚点 idle_title_glyph——「Claude Code prefixes its title with `✳` at rest」。
        /^✳/,
        // Why: Orca claude.json 锚点 idle_title_ascii——ASCII 静止前缀 `* `(干活时为 `. `)。
        /^\* /
      ]
    },
    // idle 安静门槛初值;五家统一 2000,T5 校准。
    idleQuietMs: 2000
  },
  sessions: {
    // T6:导入扫描(~/.claude/projects 下的编码目录 + jsonl 解析)
    scan: scanClaude,
    // T8:续接参数。外部参照 Orca agent-resume-argv.ts case 'claude' 原文
    // ['claude', '--resume', id](可选 effort 不做);此处按裁决返回参数部分,无 id → null
    resumeArgv: (ref) => (ref.id ? ['--resume', ref.id] : null)
  }
}
