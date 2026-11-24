// hook 接收器(hook-run-state T2):loopback HTTP,收转发脚本的 POST,路由到会话 tracker。
// 绑 127.0.0.1;token 每次应用启动随机生成(header 校验,防本机其他进程伪造事件);
// body 上限 64KB;坏请求静默 4xx,绝不影响 CLI 侧。路由判定抽纯函数 resolveHookTarget 全测,
// 服务器编排(import http)按 T5/T8 先例靠冒烟。
import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { SessionId } from '../../shared/types'

// 路由纯函数:token 匹配 + 会话有活动 PTY 才放行(spec 覆盖标准 3:串台三反例在此钉住)
export function resolveHookTarget(p: {
  token: string | undefined
  expectedToken: string
  sessionId: string | undefined
  agent: string | undefined
  event: string | undefined
  activeSessionIds: SessionId[]
}): SessionId | null {
  if (
    p.token === undefined ||
    p.token !== p.expectedToken ||
    p.sessionId === undefined ||
    p.agent === undefined ||
    p.event === undefined
  ) {
    return null
  }
  return p.activeSessionIds.includes(p.sessionId) ? p.sessionId : null
}

export interface HookReceiver {
  port: number
  token: string
  stop(): void
}

const MAX_BODY_BYTES = 64 * 1024

function readBody(request: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        resolve(null) // 超限:返回 null,调用方按坏请求处理
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', () => resolve(null))
  })
}

function respond(response: ServerResponse, code: number): void {
  response.statusCode = code
  response.end()
}

// 单例:ipc/state 启动时 listen,ipc/pty spawn 时经 getReceiverInfo 取 env 注入三件套。
// 模块级单槽(沿 terminalReadyHandler 先例:生命周期常驻,消费者只有一个)。
let receiver: HookReceiver | null = null

export function startReceiver(deps: {
  activeSessionIds: () => SessionId[]
  onEvent: (sessionId: SessionId, event: string) => void
}): HookReceiver {
  if (receiver) {
    return receiver // 重入(StrictMode/重复装配):沿 openTerminal 口径,已有实例则不动
  }
  const token = randomBytes(24).toString('hex')
  const server: Server = createServer((request, response) => {
    void (async (): Promise<void> => {
      if (request.method !== 'POST' || request.url !== '/hook') {
        respond(response, 404)
        return
      }
      const raw = await readBody(request)
      if (raw === null) {
        respond(response, 400)
        return
      }
      let parsed: { agent?: unknown; sessionId?: unknown; event?: unknown }
      try {
        parsed = JSON.parse(raw) as typeof parsed
      } catch {
        respond(response, 400)
        return
      }
      const sessionId = resolveHookTarget({
        token: request.headers['x-soloport-token'] as string | undefined,
        expectedToken: token,
        sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : undefined,
        agent: typeof parsed.agent === 'string' ? parsed.agent : undefined,
        event: typeof parsed.event === 'string' ? parsed.event : undefined,
        activeSessionIds: deps.activeSessionIds()
      })
      if (sessionId === null) {
        respond(response, 401) // 无主事件:静默拒绝(不投递)
        return
      }
      deps.onEvent(sessionId, parsed.event as string)
      respond(response, 204)
    })()
  })
  // listen(0) = 随机空闲端口(GUI 应用无端口约定,碰撞概率为零);端口在回调才可知,
  // 先立实例再回调回填——spawn 时端口未就绪(getReceiverInfo null)则不注入 env
  const instance: HookReceiver = {
    port: 0,
    token,
    stop: (): void => {
      server.close()
      receiver = null
    }
  }
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (address !== null && typeof address !== 'string') {
      instance.port = address.port
    }
  })
  receiver = instance
  return instance
}

// spawn 注入取值:接收器未启动/端口未就绪返回 null(ipc/pty 据此跳过 env 注入,spawn 照常)
export function getReceiverInfo(): { port: number; token: string } | null {
  if (receiver === null || receiver.port === 0) {
    return null
  }
  return { port: receiver.port, token: receiver.token }
}

// 测试与收尾用:确保单例可复位(vitest 隔离 / 应用退出)
export function resetReceiverForTest(): void {
  receiver?.stop()
  receiver = null
}
