// Kimi Code 插件包:定义对象 = 身份 + 状态规则 + 品牌图标/配色 + 会话扫描/续接挂接
// (brief 第 5 节固定清单;别名 kimi-code 沿用 Orca catalog)
// 状态规则:hook 事件映射(hook-run-state;事件语义经官方 hooks 文档原文核对,2026-11-23,
// kimi.com/code/docs,见 docs/agent-hooks-capability-survey.md。降级预案退役:官方 hooks
// 覆盖全部四态,degraded 档随三源引擎一并退役;注入走全局 config.toml——用户明示授权的例外,
// kimi 官方不提供项目级 hook 配置)。
import type { AgentDefinition } from '../../../../shared/agents'
import iconSvg from './icon.svg?raw'
import { scanKimi } from './scan'

export const kimiPlugin: AgentDefinition = {
  id: 'kimi',
  name: 'Kimi Code',
  command: 'kimi',
  aliases: ['kimi-code'],
  // 图标来源 = 同目录 icon.svg 经 ?raw 构建期内联(K+蓝点重出字形版);icon.svg 缺失属构建期错误,运行时恒有值
  icon: iconSvg,
  color: '#1783ff',
  state: {
    hooks: {
      working: [
        // TurnStarted = 「A new turn begins」;UserPromptSubmit = 用户消息;
        // PermissionResult = 授权完成(回位);PostToolUseFailure = 工具失败后回合继续(回位)
        'TurnStarted',
        'UserPromptSubmit',
        'PermissionResult',
        'PostToolUseFailure'
      ],
      waiting: [
        // PermissionRequest = 等待用户授权,持有键盘
        'PermissionRequest'
      ],
      idle: [
        // Stop = 「Turn completes」;Interrupt = 「fires in place of Stop」(Esc 打断)
        'Stop',
        'StopFailure',
        'Interrupt'
      ]
    }
  },
  // 全局注入(~/.kimi-code/config.toml [[hooks]],marker 块;官方不提供项目级——用户明示授权的例外)
  // ——hook-run-state T3
  hooks: { kind: 'kimi-toml' },
  sessions: {
    // T7:导入扫描(<home>/.kimi-code 的 state.json + session_index.jsonl 双源)
    scan: scanKimi,
    // T8:续接参数。外部参照 Orca agent-resume-argv.ts case 'kimi' 原文 ['kimi', '--session', id]
    // Why: Kimi resumes by id with --session; sessions are work-dir-scoped (enforced by callers).
    // 此处按裁决返回参数部分,无 id → null
    resumeArgv: (ref) => (ref.id ? ['--session', ref.id] : null)
  }
}
