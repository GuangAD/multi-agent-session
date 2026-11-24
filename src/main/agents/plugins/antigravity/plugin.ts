// Antigravity 插件包:定义对象 = 身份 + 状态规则 + 品牌图标/配色 + 会话扫描/续接挂接
// (brief 第 5 节固定清单;命令名 agy 沿用 Orca catalog)
// 状态规则:hook 事件映射(hook-run-state;事件语义经官方 hooks 文档原文核对,2026-11-23,
// antigravity.google/docs/hooks,见 docs/agent-hooks-capability-survey.md)。
import type { AgentDefinition } from '../../../../shared/agents'
import iconSvg from './icon.svg?raw'
import { scanAntigravity } from './scan'

export const antigravityPlugin: AgentDefinition = {
  id: 'antigravity',
  name: 'Antigravity',
  command: 'agy',
  // 图标来源 = 同目录 icon.svg 经 ?raw 构建期内联(打包形态无随包资产,见 src/main/env.d.ts)
  icon: iconSvg,
  // antigravity 为官方多色图标,color 仍给出品牌主蓝(载荷必填字段;渲染层是否消费归 T2)
  color: '#3186FF',
  state: {
    hooks: {
      working: [
        // PreInvocation = 模型调用前(回合开始);PostToolUse = 工具完成,回合延续
        'PreInvocation',
        'PostToolUse'
      ],
      // 官方六事件(SessionStart/PreToolUse/PostToolUse/PreInvocation/PostInvocation/Stop)无
      // waiting 类事件——waiting 态对 antigravity 不出现,brief 明示接受的缺口(2026-11-23 核对)
      waiting: [],
      idle: [
        // Stop = 「execution terminates」(载荷带 fullyIdle)
        'Stop'
      ]
    }
  },
  // workspace 级注入(.agents/hooks.json,合并写入认领制)——hook-run-state T3
  hooks: { kind: 'antigravity-json' },
  sessions: {
    // T7:导入扫描(brain transcript + history/WorkspaceURIs 关联 cwd)
    scan: scanAntigravity,
    // T8:续接参数。外部参照 Orca agent-resume-argv.ts case 'antigravity' 原文
    // ['agy', '--conversation', id](conversation_id 键;agy 即本定义 command);
    // 此处按裁决返回参数部分,无 id → null
    resumeArgv: (ref) => (ref.id ? ['--conversation', ref.id] : null)
  }
}
