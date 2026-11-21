// agent 存储根目录解析:扫描器的 homeDir 唯一解析点
// 优先级:显式传入(ctx.homeDir,生产为缺省、测试与自定义 agent home 用)> 开发覆盖环境变量 > 当前用户 home。
// Why 留一条环境变量:本机可能没装某个 agent(无 ~/.claude、~/.codex),端到端导入只能靠临时目录造存储;
// 用环境变量把 home 指到临时目录即可在不碰用户数据的前提下跑完整链路(T6 冒烟口径,T7 同样复用)。
import { homedir } from 'node:os'

// 开发/冒烟用:把 agent home 指到别处(如 .tmp 下的假存储)
export const AGENT_HOME_ENV = 'AGENT_SESSIONS_AGENT_HOME'

/** 解析本次扫描使用的 agent home 目录 */
export function resolveAgentHome(homeDir?: string): string {
  const override = process.env[AGENT_HOME_ENV]
  return homeDir ?? (override && override !== '' ? override : homedir())
}
