// Claude Code 插件包:定义对象 = 身份 + 状态规则 + 品牌图标/配色 + 会话扫描/续接挂接(brief 第 5 节固定清单)
// 状态规则初版照抄 Orca agent-state-rules/claude.json 的信号要点;规则引擎零改动(agent-state)。
import type { AgentDefinition } from '../../../../shared/agents'
import iconSvg from './icon.svg?raw'
import { scanClaude } from './scan'

export const claudePlugin: AgentDefinition = {
  id: 'claude',
  name: 'Claude Code',
  command: 'claude',
  // 图标来源 = 同目录 icon.svg 经 ?raw 构建期内联(打包形态无随包资产,见 src/main/env.d.ts)
  icon: iconSvg,
  color: '#d97757',
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
