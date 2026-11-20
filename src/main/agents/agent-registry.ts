// agent 定义注册表:收集全部定义,供安装检测/新建会话选择器/状态解析/导入查询统一取用
// (spec 模块划分;接缝:agentRegistry.register/.getById/.list)
import type { AgentDefinition } from '../../shared/agents'
import { antigravityAgent } from './definitions/antigravity'
import { claudeAgent } from './definitions/claude'
import { codexAgent } from './definitions/codex'
import { kimiAgent } from './definitions/kimi'
import { piAgent } from './definitions/pi'

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

// 固定清单(brief 第 5 节:claude/codex/agy/pi/kimi);新增 agent = 新增 definitions 文件并在此登记
agentRegistry.register([claudeAgent, codexAgent, antigravityAgent, piAgent, kimiAgent])
