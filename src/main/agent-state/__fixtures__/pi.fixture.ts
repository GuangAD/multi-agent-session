// Pi 状态样本(spec 覆盖标准「接缝 stateTracker」用例 3 与用例 11)
// 样本性质:构造样本,但输入形态取自**本机安装的 pi 1.5.0 实证**——标题静止形态
// `π - <session> - <cwd>`(bundle 的唯一标题写入 updateTerminalTitle),干活信号是屏幕状态行的
// 旋转点阵帧(Loader DEFAULT_FRAMES,Live 冒烟确认「braille 转圈 + Working」)。
// 与上一版样本的差别(2026-11-21 冒烟回归):旧样本把干活信号写成标题 `π ⠋ …`,该形态在本机 pi
// 1.5.0 已不存在,导致 pi 会话状态点永远停在 idle。时间线为人工标注。
// 真实采样(AGENT_SESSIONS_SAMPLE)到位后按实测时间线替换,输入形态不变。
import type { AgentTrackerFixture } from './tracker-fixture'

export const piFixture: AgentTrackerFixture = {
  agentId: 'pi',
  note:
    '构造样本(输入形态取自 pi 1.5.0 实证:标题静止锚点 π - …、干活信号=屏幕点阵帧),' +
    '状态序列为人工标注(启动→干活→回合结束回静止/再提交→退出),待真实采样替换时间线。',
  samples: {
    // 用例 3 的输入(前半):干活画面——状态行出现旋转帧
    'working-screen': {
      source:
        'pi 1.5.0 实证:working 指示器 = Loader DEFAULT_FRAMES 点阵帧 + Working 文字(真机冒烟确认)',
      events: [
        { type: 'bytes', atMs: 0, chunk: 'D:\\demo-project> "C:\\Users\\me\\AppData\\Roaming\\npm\\pi.cmd"\r\n' },
        { type: 'title', atMs: 200, title: 'π - build the parser' },
        { type: 'snapshot', atMs: 300, text: 'π  build the parser\n\n  ⠋ Working\n\n> ' }
      ],
      checkpoints: [{ atMs: 700, state: 'working' }]
    },
    // 用例 3 的输入(后半):回合结束后旋转帧消失,安静达门槛 → 标题静止锚点 → idle
    'idle-after-quiet': {
      source:
        '人工标注:帧消失 + 输出停止 2s(pi 1.5.0 idleQuietMs 2000)= 回合结束回静止;标题静止锚点取 pi 1.5.0 updateTerminalTitle',
      events: [
        { type: 'title', atMs: 0, title: 'π - build the parser' },
        { type: 'snapshot', atMs: 300, text: 'π  build the parser\n\n  ⠋ Working\n\n> ' },
        { type: 'snapshot', atMs: 2000, text: 'π  build the parser\n\n  Done. 3 files changed.\n\n> ' }
      ],
      checkpoints: [
        { atMs: 700, state: 'working' }, // t=300 判 working,去抖 300 → t=600 落地
        { atMs: 5000, state: 'idle' } // 末次活动 t=2000 + 安静 2000 → t=4000 判 idle,去抖 → t=4300
      ]
    },
    // 用例 11 的输入:整段会话回放(人工标注)
    session: {
      source:
        '人工标注:启动只出字节=idle → 首个干活画面=None 帧 → working → 输出流动保持 working → 帧消失 + 输出停止 → idle → 再提交 → working → PTY 退出=exited → 迟到标题不改变;输入形态取 pi 1.5.0 实证',
      events: [
        {
          type: 'bytes',
          atMs: 0,
          chunk: 'D:\\demo-project> "C:\\Users\\me\\AppData\\Roaming\\npm\\pi.cmd"\r\n'
        },
        { type: 'title', atMs: 200, title: 'π - build the parser' },
        {
          type: 'snapshot',
          atMs: 300,
          text: 'π  build the parser\n\n  Ready. Type your message.\n\n> '
        },
        { type: 'snapshot', atMs: 800, text: 'π  build the parser\n\n  ⠋ Working\n\n> ' },
        { type: 'bytes', atMs: 1500, chunk: 'I will add the tokenizer first.' },
        {
          type: 'snapshot',
          atMs: 3000,
          text: 'π  build the parser\n\n  Done. 3 files changed.\n\n> '
        },
        { type: 'bytes', atMs: 6000, chunk: 'add a test for the tokenizer\r\n' },
        {
          type: 'snapshot',
          atMs: 6200,
          text: 'π  build the parser\n\n  ⠹ Working\n\n> add a test for the tokenizer\n'
        },
        { type: 'exit', atMs: 8000, code: 0 },
        { type: 'title', atMs: 8500, title: 'cmd' }
      ],
      checkpoints: [
        { atMs: 400, state: 'idle' }, // 只有 shell 回显,无地标、无标题命中 → 仍 idle
        { atMs: 1200, state: 'working' }, // t=800 判 working,去抖 → t=1100
        { atMs: 1600, state: 'working' },
        { atMs: 3200, state: 'working' }, // 帧消失但输出仍未静止:维持原判
        { atMs: 5500, state: 'idle' }, // t=3000 + 2000 → t=5000 判 idle,去抖 → t=5300
        { atMs: 6600, state: 'working' }, // t=6200 再出现帧,去抖 → t=6500
        { atMs: 8100, state: 'exited' }, // 退出立即落地
        { atMs: 9000, state: 'exited' }
      ]
    }
  }
}
