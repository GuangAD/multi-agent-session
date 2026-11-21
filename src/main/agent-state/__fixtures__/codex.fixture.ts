// Codex CLI 状态样本(构造样本:依据 Orca agent-state-rules/codex.json 的屏幕锚点 why;
// 真实采样(AGENT_SESSIONS_SAMPLE)到位后替换)
import type { AgentTrackerFixture } from './tracker-fixture'

// 就绪头部横幅:构造样本按 Orca 锚点 ready_header 的形状(横幅含 `openai codex` 与其下的
// `model:`/`directory:` 标签行)。品牌行大小写随版本变化(0.158 起 Header 无标签),故样本里
// 保留 `OpenAI Codex` 的混合大小写,由引擎做大小写不敏感匹配。
const READY_HEADER = [
  '╭──────────────────────────────────────────────────────────╮',
  '│ >_ OpenAI Codex (v0.157.0)                               │',
  '│                                                          │',
  '│ model:     gpt-5.1-codex          directory: D:/demo-project │',
  '╰──────────────────────────────────────────────────────────╯',
  ''
].join('\n')

export const codexFixture: AgentTrackerFixture = {
  agentId: 'codex',
  note:
    '构造样本,依据 Orca codex.json 锚点 ready_header(why:启动头部横幅与其 model/directory 标签是跨版本稳定的就绪画面;' +
    '该锚点 answer 为 idle 且规则 header_ready 带 requiresQuiet)与锚点 plan_implement_menu(why:Plan 回合结束停在此菜单,' +
    '菜单持有键盘,发给 pane 的文本等于选项输入)。本引擎把「画面已绘制」读作 working,静止达安静门槛后由地标+安静判 idle;' +
    '菜单类地标读 waiting。待真实采样替换。',
  samples: {
    // 用例 4 的输入:头部横幅(就绪画面已绘制)
    'ready-header': {
      source:
        'Orca codex.json ready_header why「startup header with its model and directory labels」',
      events: [{ type: 'snapshot', atMs: 0, text: READY_HEADER }],
      // 两个检查点钉住「地标 + 安静门槛」两侧:横幅常驻但输出静止,规则要求 requiresQuiet(true)才判就绪,
      // 故同一份画面先 working(输出仍在流动)后 idle(安静已达门槛)。
      // 手算时间线(t=0 为快照到达;idleQuietMs=2000,去抖 300):t=0 地标命中且 !quiet → working,
      // t=300 去抖落地 working;t=2000 安静门槛到点 → 判 idle,t=2300 落地。2600 在 2300 之后留出余量。
      checkpoints: [
        { atMs: 400, state: 'working' },
        { atMs: 2600, state: 'idle' }
      ]
    },
    // 用例 5 的输入:确认菜单(横幅仍在屏上,菜单优先 → waiting)
    'plan-menu': {
      source:
        'Orca codex.json plan_implement_menu why「a Plan-mode turn ends in this menu … it owns the keyboard, so text sent to the pane picks a choice」',
      events: [
        {
          type: 'snapshot',
          atMs: 0,
          text: [
            READY_HEADER,
            '  Plan mode ready.',
            '> 1. Yes, implement this plan?',
            '  2. No, stay in plan mode',
            '  enter select · esc back'
          ].join('\n')
        }
      ],
      checkpoints: [{ atMs: 400, state: 'waiting' }]
    }
  }
}
