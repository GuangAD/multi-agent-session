// 插件清单:agentRegistry 的唯一登记点(接缝;T1 插件化)
// 新增 agent = 新增 plugins/<id>/ 插件包(plugin.ts + scan.ts + icon.svg + fixtures + test)+ 此处一行。
// 装载方式:入口 src/main/index.ts 与需要真实注册表的测试 import 本模块(注册表本体不再自带清单,
// 也不 import 任何具体插件——依赖方向:plugins → registry,反向即违例)。
import { agentRegistry } from '../agent-registry'
import { antigravityPlugin } from './antigravity/plugin'
import { claudePlugin } from './claude/plugin'
import { codexPlugin } from './codex/plugin'
import { kimiPlugin } from './kimi/plugin'
import { piPlugin } from './pi/plugin'

// 固定清单(brief 第 5 节:claude/codex/agy/pi/kimi);顺序 = 注册顺序 = agents:list 展示顺序
agentRegistry.register([claudePlugin, codexPlugin, antigravityPlugin, piPlugin, kimiPlugin])
