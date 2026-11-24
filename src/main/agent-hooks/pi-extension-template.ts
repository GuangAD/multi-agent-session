// pi 项目级扩展模板(hook-run-state T3):注入器将内容写入 <project>/.pi/extensions/soloport-state.ts。
// Why 落在本域而非 plugins/pi:模板承载 env 令牌/HTTP 转发等注入机构(归 hook 子系统),事件清单
// 由注入器从 pi 插件 state.hooks 三槽并集生成——事件名的单一事实源仍是插件声明,模板对事件集合泛化。
// pi 扩展是进程内 TS(jiti 直载),默认导出工厂接收 ExtensionAPI;注册后 fire-and-forget 转发,
// fail-open:任何错误静默,绝不影响 pi 会话本身。应用外裸跑 pi:无 env 令牌 → 不注册任何 handler。
// 事件清单由注入器注入(见 generatePiExtension 入参),不硬编码。
export function generatePiExtension(events: string[]): string {
  return `// Managed by Soloport (hook-run-state) — reconciled on app start; do not edit.
// Forwards pi lifecycle events to the Soloport receiver (loopback HTTP) so the app can show
// session state. Env tokens are injected into the PTY at spawn; without them (pi running
// outside Soloport) this extension registers nothing and stays silent.
// Fail-open: every error is swallowed — must never affect the pi session.
const port = process.env.SOLOPORT_HOOK_PORT
const sessionId = process.env.SOLOPORT_SESSION_ID
const token = process.env.SOLOPORT_HOOK_TOKEN
const events = ${JSON.stringify(events)}

export default function (pi) {
  if (!port || !sessionId || !token) {
    return
  }
  const forward = (event) => () => {
    try {
      void fetch('http://127.0.0.1:' + port + '/hook', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-soloport-token': token },
        body: JSON.stringify({ agent: 'pi', sessionId, event }),
        signal: AbortSignal.timeout(2000)
      }).catch(() => {})
    } catch {
      // fail-open
    }
  }
  for (const event of events) {
    try {
      pi.on(event, forward(event))
    } catch {
      // fail-open:pi 侧事件名变动时静默跳过
    }
  }
}
`
}
