// hook 事件序列 fixture(hook-run-state T1):期望值来源必须是独立事实——各家官方 hooks 文档
// 语义(调研存档 docs/agent-hooks-capability-survey.md;官方原文快照 .tmp/hook-docs/;pi 另核
// 本机 1.6.0 包内 docs/extensions.md),不得由被测引擎复算。fixture 只写「该事件后应为某状态」,
// 回放由 hook-tracker.test.ts 完成。
import type { AgentId, SessionRunState } from '../../../shared/types'

export interface HookFixtureStep {
  // CLI 原生 hook 事件名
  event: string
  // 事件后的期望状态;null = 不产生广播(同态幂等或该家未声明的事件)
  expect: SessionRunState | null
}

export interface HookFixtureSample {
  // 期望值来源锚点(官方文档语义 + 摘要)
  source: string
  steps: HookFixtureStep[]
}

export interface AgentHookFixture {
  agentId: AgentId
  note: string
  samples: Record<string, HookFixtureSample>
}

// —— 五家样本(事件名 = 各 CLI 原生 hook 事件,与各插件 state.hooks 声明一致)——

const claudeFixture: AgentHookFixture = {
  agentId: 'claude',
  note: '官方 hooks 文档(docs/en/hooks);事件语义 2026-11-23 原文核对',
  samples: {
    'turn-lifecycle': {
      source:
        'UserPromptSubmit=提交提示开始回合;PostToolUse=批准后工具执行(回合延续,waiting 的回位事件,约定);PostToolUseFailure=拒绝/失败后回合继续(Orca 同款:等待恢复缺省回落 working);PermissionRequest=请求授权;Stop=「When Claude finishes responding」;StopFailure 同落 idle(API 错误结束回合)',
      steps: [
        { event: 'UserPromptSubmit', expect: 'working' },
        { event: 'PostToolUse', expect: null }, // 已是 working:同态幂等,不广播
        { event: 'PermissionRequest', expect: 'waiting' },
        { event: 'PostToolUse', expect: 'working' }, // 批准 → 工具执行 → 回 working
        { event: 'Stop', expect: 'idle' },
        { event: 'StopFailure', expect: null } // 已是 idle
      ]
    },
    'permission-denied': {
      source:
        '拒绝路径:PermissionRequest → 用户拒绝 → 无 PostToolUse,PostToolUseFailure 报告失败,回合继续(回 working),最终 Stop 收口',
      steps: [
        { event: 'UserPromptSubmit', expect: 'working' },
        { event: 'PermissionRequest', expect: 'waiting' },
        { event: 'PostToolUseFailure', expect: 'working' },
        { event: 'Stop', expect: 'idle' }
      ]
    }
  }
}

const codexFixture: AgentHookFixture = {
  agentId: 'codex',
  note: '官方 hooks 文档(learn.chatgpt.com/docs/hooks);事件语义 2026-11-23 原文核对',
  samples: {
    'turn-lifecycle': {
      source:
        'UserPromptSubmit=提示即将发送(回合开始);PermissionRequest=「about to ask for approval」;Stop=「When a chat turn stops」',
      steps: [
        { event: 'UserPromptSubmit', expect: 'working' },
        { event: 'PermissionRequest', expect: 'waiting' },
        { event: 'Stop', expect: 'idle' }
      ]
    }
  }
}

const kimiFixture: AgentHookFixture = {
  agentId: 'kimi',
  note: '官方 hooks 文档(kimi.com/code/docs);事件语义 2026-11-23 原文核对;本机未装,装后复核',
  samples: {
    'turn-lifecycle': {
      source:
        'TurnStarted=「A new turn begins」;PermissionRequest=等待授权;PermissionResult=授权完成(回合继续,回位事件);PostToolUseFailure=工具失败后回合继续(回位);Interrupt=「fires in place of Stop」;Stop=「Turn completes」',
      steps: [
        { event: 'TurnStarted', expect: 'working' },
        { event: 'PermissionRequest', expect: 'waiting' },
        { event: 'PermissionResult', expect: 'working' },
        { event: 'Interrupt', expect: 'idle' }
      ]
    }
  }
}

const piFixture: AgentHookFixture = {
  agentId: 'pi',
  note: '本机 1.6.0 包内 docs/extensions.md 语义(0.85.0 起含 ui_prompt 事件);扩展由我们编写,直接 POST 原生事件名',
  samples: {
    'turn-lifecycle': {
      source:
        'input=提交的提示词(源码核对:emitInput 仅由提交路径调用);turn_start/turn_end=回合边界;agent_settled=「final idle signal」',
      steps: [
        { event: 'input', expect: 'working' },
        { event: 'turn_start', expect: null }, // 已是 working
        { event: 'turn_end', expect: null }, // 已是 working
        { event: 'agent_settled', expect: 'idle' }
      ]
    },
    'startup-splash': {
      source:
        '2026-11-24 冒烟实证:pi 启动欢迎屏(ctx.ui 阻塞屏)关闭发 ui_prompt_end,关闭后 pi 闲在提示符——不得置 working(否则 spinner 卡到首个回合结束);ui_prompt_start→waiting 无 UI 表现,无副作用',
      steps: [
        { event: 'ui_prompt_start', expect: 'waiting' },
        { event: 'ui_prompt_end', expect: null }, // 回归钉住:欢迎屏关闭不再误置 working(旧缺陷)
        { event: 'agent_settled', expect: 'idle' }
      ]
    },
    'trust-dialog': {
      source:
        'project_trust=项目信任询问(仅未保存信任首次;源码核对:项目级扩展在信任解析后才加载,实际收不到——映射保留为防御,不依赖)',
      steps: [
        { event: 'project_trust', expect: 'waiting' },
        { event: 'input', expect: 'working' },
        { event: 'agent_settled', expect: 'idle' }
      ]
    }
  }
}

const antigravityFixture: AgentHookFixture = {
  agentId: 'antigravity',
  note: '官方 hooks 文档(antigravity.google/docs/hooks);事件语义 2026-11-23 原文核对;本机未装,装后复核',
  samples: {
    'turn-lifecycle': {
      source:
        'PreInvocation=模型调用前(回合开始);PostToolUse=工具完成(回合延续);Stop=「execution terminates」(带 fullyIdle);官方无 waiting 类事件(六事件核对),PermissionRequest 等对 antigravity 是未知事件 → 忽略',
      steps: [
        { event: 'PreInvocation', expect: 'working' },
        { event: 'PostToolUse', expect: null }, // 已是 working
        { event: 'PermissionRequest', expect: null }, // waiting 槽为空:未知事件忽略(缺口固化)
        { event: 'Stop', expect: 'idle' }
      ]
    }
  }
}

export const hookFixtures: AgentHookFixture[] = [
  claudeFixture,
  codexFixture,
  kimiFixture,
  piFixture,
  antigravityFixture
]
