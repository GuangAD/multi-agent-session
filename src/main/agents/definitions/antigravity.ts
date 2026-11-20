// Antigravity CLI 定义(brief 第 5 节固定清单;命令名 agy 沿用 Orca catalog)
// 状态规则初版照抄 Orca agent-state-rules/antigravity.json 的信号要点;规则引擎 T5 落地,此处只提供数据。
import type { AgentDefinition } from '../../../shared/agents'

export const antigravityAgent: AgentDefinition = {
  id: 'antigravity',
  name: 'Antigravity',
  command: 'agy',
  icon: 'A',
  state: {
    screen: {
      // Why: Orca antigravity.json 规则 composer_ready(idle 语义,requiresQuiet)的第四行 `^\? for shortcuts`——composer 提示行是就绪画面的稳定地标。
      // `^>$` 为整行锚,子串匹配下取提示行子串;本结构 screen 无 idle 槽,初版挂 working,配合安静门槛由 T5 判 idle。
      working: ['? for shortcuts'],
      // Why: Orca antigravity-text-composer.ts 就绪证伪扫描(`do you trust|sign in|select a model|…`)——信任/权限类菜单在屏即非就绪且占用键盘 → waiting;fixture antigravity-1-2-14-trust-dialog.txt 实证。
      waiting: ['do you trust']
    },
    // idle 安静门槛初值;五家统一 2000,T5 校准。
    idleQuietMs: 2000
  }
}
