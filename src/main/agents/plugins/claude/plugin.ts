// Claude Code 插件包:定义对象 = 身份 + 状态规则 + 品牌图标/配色 + 会话扫描/续接挂接(brief 第 5 节固定清单)
// 状态规则:hook 事件映射(hook-run-state;事件语义经官方 hooks 文档原文核对,2026-11-23,
// 见 docs/agent-hooks-capability-survey.md 与 agent-state/__fixtures__/hook-fixtures.ts 锚点)。
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
    hooks: {
      working: [
        // UserPromptSubmit = 提交提示,回合开始
        'UserPromptSubmit',
        // PostToolUse = 批准后工具执行,回合延续(waiting 的回位事件);
        // PostToolUseFailure = 拒绝/失败后回合继续(Orca 同款语义:等待恢复缺省回落 working;
        // 旧版本可能不发此事件,引擎对未声明事件自动忽略,声明无害)
        'PostToolUse',
        'PostToolUseFailure'
      ],
      waiting: [
        // PermissionRequest = 工具请求授权,持有键盘
        'PermissionRequest',
        // Notification = 官方语义较宽(含 idle 提醒),可能收窄——T5 实机校准
        'Notification'
      ],
      idle: [
        // Stop = 「When Claude finishes responding」;StopFailure = API 错误结束回合
        'Stop',
        'StopFailure'
      ]
    }
  },
  // 项目级注入(.claude/settings.json,合并写入认领制)——hook-run-state T3
  hooks: { kind: 'claude-settings' },
  sessions: {
    // T6:导入扫描(~/.claude/projects 下的编码目录 + jsonl 解析)
    scan: scanClaude,
    // T8:续接参数。外部参照 Orca agent-resume-argv.ts case 'claude' 原文
    // ['claude', '--resume', id](可选 effort 不做);此处按裁决返回参数部分,无 id → null
    resumeArgv: (ref) => (ref.id ? ['--resume', ref.id] : null)
  }
}
