// Kimi Code CLI 定义(brief 第 5 节固定清单;别名 kimi-code 沿用 Orca catalog)
// 状态规则初版:降级预案(plan M3/brief 第 5 节)——屏幕识别无公开先例,Orca 亦无其屏幕规则。
import type { AgentDefinition } from '../../../shared/agents'

export const kimiAgent: AgentDefinition = {
  id: 'kimi',
  name: 'Kimi Code',
  command: 'kimi',
  aliases: ['kimi-code'],
  icon: 'K',
  state: {
    // Why: kimi 状态识别走降级——只用「有输出=working、退出=exited」,waiting 并入相邻态(brief 第 5 节降级预案);不设 title/screen/bytes 规则,T5 采样找到可靠信号再升级。
    degraded: true,
    // 降级态的唯一时间参数:静默达此门槛即 idle(T5 state-parser 的降级档消费它);
    // 采到可靠屏幕信号升级为非降级规则后再按样本校准。
    idleQuietMs: 2000
  }
}
