// Codex CLI 插件包:定义对象 = 身份 + 状态规则 + 品牌图标/配色 + 会话扫描/续接挂接(brief 第 5 节固定清单)
// 状态规则初版照抄 Orca agent-state-rules/codex.json 的信号要点;规则引擎零改动(agent-state)。
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
    screen: {
      // Why: Orca codex.json 锚点 ready_header——启动头部横幅 `openai codex`(其下含 `model:`/`directory:` 行)是跨版本稳定的就绪画面,横幅整个 turn 都在(header_ready 规则 requiresQuiet)。
      // Orca 语义为 idle;本结构 screen 只有 working/waiting 槽,初版挂 working 表示「Codex 画面已绘制」:未静止读 working,静止达 idleQuietMs 后 T5 判 idle。
      working: ['openai codex', 'model:', 'directory:'],
      // Why: Orca codex.json 锚点 plan_implement_menu——Plan 模式回合结束停在「implement this plan?」菜单,菜单持有键盘,等用户选择 → waiting。
      waiting: ['implement this plan?']
    },
    // idle 安静门槛初值;五家统一 2000,T5 校准。
    idleQuietMs: 2000
  },
  sessions: {
    // T6:导入扫描(~/.codex/sessions 下的 rollout,含 .zst 变体)
    scan: scanCodex,
    // T8:续接参数。外部参照 Orca agent-resume-argv.ts case 'codex' 原文
    // ['codex', 'resume', id](resume 子命令,非 --flag);此处按裁决返回参数部分,无 id → null
    resumeArgv: (ref) => (ref.id ? ['resume', ref.id] : null)
  }
}
