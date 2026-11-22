// Kimi Code 插件包:定义对象 = 身份 + 状态规则 + 品牌图标/配色 + 会话扫描/续接挂接
// (brief 第 5 节固定清单;别名 kimi-code 沿用 Orca catalog)
// 状态规则初版:降级预案(plan M3/brief 第 5 节)——屏幕识别无公开先例,Orca 亦无其屏幕规则。
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
    // Why: kimi 状态识别走降级——只用「有输出=working、退出=exited」,waiting 并入相邻态(brief 第 5 节降级预案);不设 title/screen/bytes 规则,T5 采样找到可靠信号再升级。
    degraded: true,
    // 降级态的唯一时间参数:静默达此门槛即 idle(T5 state-parser 的降级档消费它);
    // 采到可靠屏幕信号升级为非降级规则后再按样本校准。
    idleQuietMs: 2000
  },
  sessions: {
    // T7:导入扫描(<home>/.kimi-code 的 state.json + session_index.jsonl 双源)
    scan: scanKimi,
    // T8:续接参数。外部参照 Orca agent-resume-argv.ts case 'kimi' 原文 ['kimi', '--session', id]
    // Why: Kimi resumes by id with --session; sessions are work-dir-scoped (enforced by callers).
    // 此处按裁决返回参数部分,无 id → null
    resumeArgv: (ref) => (ref.id ? ['--session', ref.id] : null)
  }
}
