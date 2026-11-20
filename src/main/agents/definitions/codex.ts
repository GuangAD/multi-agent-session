// Codex CLI 定义(brief 第 5 节固定清单)
// 状态规则初版照抄 Orca agent-state-rules/codex.json 的信号要点;规则引擎 T5 落地,此处只提供数据。
import type { AgentDefinition } from '../../../shared/agents'

export const codexAgent: AgentDefinition = {
  id: 'codex',
  name: 'Codex CLI',
  command: 'codex',
  icon: 'C',
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
  }
}
