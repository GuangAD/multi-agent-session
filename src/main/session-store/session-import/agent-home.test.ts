// agent home 解析(agent-home.ts)的优先级守卫:显式 ctx.homeDir > 开发覆盖环境变量 > 当前用户 home
// 期望值来源:模块注释里写死的优先级契约(手算);环境变量名取导出常量,不在用例里重复字面量。
import { homedir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { AGENT_HOME_ENV, resolveAgentHome } from './agent-home'

const saved = process.env[AGENT_HOME_ENV]

afterEach(() => {
  if (saved === undefined) {
    delete process.env[AGENT_HOME_ENV]
  } else {
    process.env[AGENT_HOME_ENV] = saved
  }
})

describe('resolveAgentHome 优先级', () => {
  it('显式 homeDir 优先于环境变量与用户 home', () => {
    process.env[AGENT_HOME_ENV] = '/tmp/env-home'
    expect(resolveAgentHome('/tmp/explicit-home')).toBe('/tmp/explicit-home')
  })

  it('无显式 homeDir 时用环境变量覆盖', () => {
    process.env[AGENT_HOME_ENV] = '/tmp/env-home'
    expect(resolveAgentHome()).toBe('/tmp/env-home')
    expect(resolveAgentHome(undefined)).toBe('/tmp/env-home')
  })

  it('环境变量为空串/未设置时回退当前用户 home', () => {
    process.env[AGENT_HOME_ENV] = ''
    expect(resolveAgentHome(), '空串按未设置处理').toBe(homedir())
    delete process.env[AGENT_HOME_ENV]
    expect(resolveAgentHome()).toBe(homedir())
  })
})
