// agent 定义注册表:收集全部定义,供安装检测/新建会话选择器/状态解析/导入查询统一取用
// (spec 模块划分;接缝:agentRegistry.register/.getById/.list)
// T1 插件化:本模块不再 import 任何具体插件、不再自带固定清单——唯一登记点在 ./plugins,
// 由入口 src/main/index.ts 装载;新增 agent = 新增插件包 + 清单一行,注册表本体零改动。
import type { AgentDefinition } from '../../shared/agents'

// 内表:数组保注册顺序;id 直接索引,别名经顺序归一(命中同一定义)
const defs: AgentDefinition[] = []
const byId = new Map<string, AgentDefinition>()

export const agentRegistry = {
  // 副作用与重入:向内表累积;重复 id 抛错(契约口径)
  register(newDefs: AgentDefinition[]): void {
    for (const def of newDefs) {
      if (byId.has(def.id)) {
        throw new Error(`agent 定义重复注册:${def.id}`)
      }
      byId.set(def.id, def)
      defs.push(def)
    }
  },

  // 别名先归一(aliases 命中同一定义);未知返回 undefined,不抛错(契约口径)
  getById(idOrAlias: string): AgentDefinition | undefined {
    const direct = byId.get(idOrAlias)
    if (direct) {
      return direct
    }
    return defs.find((def) => def.aliases?.includes(idOrAlias) ?? false)
  },

  // 纯读:返回副本,调用方改动不进内表;顺序 = 注册顺序,稳定(契约口径)
  list(): AgentDefinition[] {
    return [...defs]
  }
}
