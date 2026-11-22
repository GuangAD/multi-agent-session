// Antigravity 插件包:定义对象 = 身份 + 状态规则 + 品牌图标/配色 + 会话扫描/续接挂接
// (brief 第 5 节固定清单;命令名 agy 沿用 Orca catalog)
// 状态规则初版照抄 Orca agent-state-rules/antigravity.json 的信号要点;规则引擎零改动(agent-state)。
import type { AgentDefinition } from '../../../../shared/agents'
import iconSvg from './icon.svg?raw'
import { scanAntigravity } from './scan'

export const antigravityPlugin: AgentDefinition = {
  id: 'antigravity',
  name: 'Antigravity',
  command: 'agy',
  // 图标来源 = 同目录 icon.svg 经 ?raw 构建期内联(打包形态无随包资产,见 src/main/env.d.ts)
  icon: iconSvg,
  // antigravity 为官方多色图标,color 仍给出品牌主蓝(载荷必填字段;渲染层是否消费归 T2)
  color: '#3186FF',
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
  },
  sessions: {
    // T7:导入扫描(brain transcript + history/WorkspaceURIs 关联 cwd)
    scan: scanAntigravity,
    // T8:续接参数。外部参照 Orca agent-resume-argv.ts case 'antigravity' 原文
    // ['agy', '--conversation', id](conversation_id 键;agy 即本定义 command);
    // 此处按裁决返回参数部分,无 id → null
    resumeArgv: (ref) => (ref.id ? ['--conversation', ref.id] : null)
  }
}
