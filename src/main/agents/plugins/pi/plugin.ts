// Pi 插件包:定义对象 = 身份 + 状态规则 + 品牌图标/配色 + 会话扫描/续接挂接(brief 第 5 节固定清单)
// 状态规则:hook 事件映射(hook-run-state;事件语义经本机 pi 1.6.0 包内 docs/extensions.md
// 核对,2026-11-23,见 docs/agent-hooks-capability-survey.md。pi 无 shell-command hook,
// 接入形态 = 我们编写的进程内 TS 扩展,POST 原生事件名)。
import type { AgentDefinition } from '../../../../shared/agents'
import iconSvg from './icon.svg?raw'
import { scanPi } from './scan'

export const piPlugin: AgentDefinition = {
  id: 'pi',
  name: 'Pi',
  command: 'pi',
  // 图标来源 = 同目录 icon.svg 经 ?raw 构建期内联(打包形态无随包资产,见 src/main/env.d.ts)
  icon: iconSvg,
  color: '#059669',
  state: {
    hooks: {
      working: [
        // input = 提交的提示词到达(2026-11-24 源码核对:emitInput 仅由 steer/followUp/prompt 提交路径调用,
        // 非逐键);turn_start/turn_end = 每回合边界。ui_prompt_end 不挂 working——冒烟实证:pi 启动欢迎屏
        // (ctx.ui 阻塞屏)关闭也发它,关闭后 pi 闲在提示符却被置 working,spinner 卡到首个回合结束;
        // 「对话框关闭回 working」已由 turn_start(下回合)/turn_end(本回合收尾)/agent_settled(完成)自然覆盖
        'input',
        'turn_start',
        'turn_end'
      ],
      waiting: [
        // ui_prompt_start = 扩展经 ctx.ui.* 画的阻塞屏(notification-only,0.85.0 起有;启动欢迎屏也走它,
        // waiting 无 UI 表现故无副作用);project_trust = 项目信任询问(仅未保存信任的首次,源码核对
        // resolveProjectTrusted:已保存信任早退不发;且事件在项目扩展加载前发出,项目级扩展实际收不到)
        'ui_prompt_start',
        'project_trust'
      ],
      idle: [
        // agent_settled = 「final idle signal」(权威「不会再继续」);session_shutdown = pi 退出回 shell
        'agent_settled',
        'session_shutdown'
      ]
    }
  },
  // 项目级注入(.pi/extensions/soloport-state.ts,进程内 TS 扩展;需 pi 信任该项目)——hook-run-state T3
  hooks: { kind: 'pi-extension' },
  sessions: {
    // T7:导入扫描(home = <home>/.pi/agent/sessions)
    scan: scanPi,
    // T8:续接参数(2026-11-23 用户裁决:pi 1.6.0 的 --session 接受路径或完整/部分 id,
    // pi 退出时自打印「To resume this session: pi --session <id>」即官方推荐形态,命令行
    // 不再携带完整转录路径)。id 缺失的旧记录降级用转录路径;两者皆无 → null 原样拉起。
    resumeArgv: (ref) =>
      ref.id ? ['--session', ref.id] : ref.filePath ? ['--session', ref.filePath] : null
  }
}
