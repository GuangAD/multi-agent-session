// Pi 插件包:定义对象 = 身份 + 状态规则 + 品牌图标/配色 + 会话扫描/续接挂接(brief 第 5 节固定清单)
// 状态规则按**本机安装的 pi 1.5.0** 校准(2026-11-21 冒烟回归:初版照 Orca pi.json 锚点写的
// `π ⠋` 干活标题在该版本已不存在,pi 会话的状态点永远停在 idle)
import type { AgentDefinition } from '../../../../shared/agents'
import iconSvg from './icon.svg?raw'
import { scanPi } from './scan'

// working 地标 = pi 的 working 指示器旋转帧:bundle 的 Loader DEFAULT_FRAMES
// = U+280B U+2819 U+2839 U+2838 U+283C U+2834 U+2826 U+2827 U+2807 U+280F,80ms 换一帧,
// 画在编辑器上边框 / 状态行(真机冒烟确认:braille 转圈 + 紧随的 Working 文字)。
// Why 用点阵帧而不是旁边的 "Working" 文字:对话正文里可能出现 Working 字样并留在屏幕上,
// 那会让 working 永久命中、状态再也不回落(失败形态第 1 条);点阵帧只由指示器自己画。
const WORKING_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export const piPlugin: AgentDefinition = {
  id: 'pi',
  name: 'Pi',
  command: 'pi',
  // 图标来源 = 同目录 icon.svg 经 ?raw 构建期内联(打包形态无随包资产,见 src/main/env.d.ts)
  icon: iconSvg,
  color: '#059669',
  state: {
    title: {
      // Why: pi 1.5.0 唯一的标题写入是 `updateTerminalTitle()` → `π - <session> - <cwd>`
      // (APP_TITLE = "π"),静止与干活同形——干活信号只在屏幕上,标题这里只留静止锚点。
      // 空数组 = 「本条源不提供该状态」的显式表态(AgentStateRules 的 two 槽形状不可省略)。
      working: [],
      idle: [/^π - /]
    },
    screen: {
      // 干活中:状态行/上边框出现旋转帧;回合结束后帧消失,安静达门槛 → 标题静止锚点 → idle
      working: WORKING_FRAMES,
      // 空数组理由同 title.working:本机 pi 没有等待输入的菜单(见上方说明)。
      waiting: []
    },
    // 不配 waiting 地标:pi 不做逐工具授权(docs/security.md:「does not ask for approval before
    // every tool call」),唯一的阻塞对话框是项目信任(本机冒烟未出现);真出现时再按实证补规则,
    // 不凭猜测提前写。
    // idle 安静门槛:指示器 80ms 一帧、干活期输出不断流,安静 2s 即回合结束。
    idleQuietMs: 2000
  },
  sessions: {
    // T7:导入扫描(home = <home>/.pi/agent/sessions)
    scan: scanPi,
    // T8:续接参数。外部参照 Orca agent-resume-argv.ts case 'pi' 原文:transcriptPath 存在才
    // ['pi', '--session', transcriptPath],否则 null——pi 只按转录路径续接,id 不替代;
    // 此处按裁决返回参数部分,无 filePath → null
    resumeArgv: (ref) => (ref.filePath ? ['--session', ref.filePath] : null)
  }
}
