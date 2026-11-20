// Pi 定义(brief 第 5 节固定清单)
// 状态规则初版照抄 Orca agent-state-rules/pi.json 的信号要点;规则引擎 T5 落地,此处只提供数据。
import type { AgentDefinition } from '../../../shared/agents'

export const piAgent: AgentDefinition = {
  id: 'pi',
  name: 'Pi',
  command: 'pi',
  icon: 'P',
  state: {
    title: {
      // Why: Orca pi.json 锚点 idle_title——「Pi … title the pane `π - <session>` at rest (`π ⠋ <session>` while working).」
      idle: [/^π - /],
      // Why: 同锚点 why 的工作形态 `π ⠋ <session>`。
      working: [/^π ⠋/]
    },
    // idle 安静门槛初值;五家统一 2000,T5 校准。
    idleQuietMs: 2000
  }
}
