// Codex CLI 插件包:定义对象 = 身份 + 状态规则 + 品牌图标/配色 + 会话扫描/续接挂接(brief 第 5 节固定清单)
// 状态规则:hook 事件映射(hook-run-state;事件语义经官方 hooks 文档原文核对,2026-11-23,
// learn.chatgpt.com/docs/hooks,见 docs/agent-hooks-capability-survey.md)。
import type { AgentDefinition } from '../../../../shared/agents'
import iconSvg from './icon.svg?raw'
import { scanCodex } from './scan'

export const codexPlugin: AgentDefinition = {
  id: 'codex',
  name: 'Codex CLI',
  command: 'codex',
  // 图标来源 = 同目录 icon.svg 经 ?raw 构建期内联(打包形态无随包资产,见 src/main/env.d.ts)
  icon: iconSvg,
  color: '#0284c7',
  state: {
    hooks: {
      working: [
        // UserPromptSubmit = 提示即将发送,回合开始;PostToolUse = 工具完成,回合延续
        'UserPromptSubmit',
        'PostToolUse'
      ],
      waiting: [
        // PermissionRequest = 「about to ask for approval」,持有键盘
        'PermissionRequest'
      ],
      idle: [
        // Stop = 「When a chat turn stops」
        'Stop'
      ]
    }
  },
  // repo 级注入(.codex/hooks.json,合并写入认领制;需 codex 信任该项目)——hook-run-state T3
  hooks: { kind: 'codex-json' },
  sessions: {
    // T6:导入扫描(~/.codex/sessions 下的 rollout,含 .zst 变体)
    scan: scanCodex,
    // T8:续接参数。外部参照 Orca agent-resume-argv.ts case 'codex' 原文
    // ['codex', 'resume', id](resume 子命令,非 --flag);此处按裁决返回参数部分,无 id → null
    resumeArgv: (ref) => (ref.id ? ['resume', ref.id] : null)
  }
}
