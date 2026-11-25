// getCliInstallDirs 纯函数测试(D7):目录清单的平台分支与 fnm 环境推导
// 期望值来源:手算 join 结果;env 注入(FNM_DIR/APPDATA)按 Orca 原件语义。
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getCliInstallDirs } from './cli-install-dirs'

describe('getCliInstallDirs(D7 安装位兜底清单)', () => {
  it('win32:含 Claude/Codex 官方安装位与 npm 全局目录,fnm 默认走 %APPDATA%\\fnm', () => {
    const dirs = getCliInstallDirs('win32', 'C:\\Users\\demo', {})
    expect(dirs).toContain(join('C:\\Users\\demo', '.local', 'bin'))
    expect(dirs).toContain(
      join('C:\\Users\\demo', 'AppData', 'Local', 'Programs', 'OpenAI', 'Codex', 'bin')
    )
    expect(dirs).toContain(join('C:\\Users\\demo', 'AppData', 'Roaming', 'npm'))
    // fnm:无 FNM_DIR 时用 APPDATA(显式注入)推导
    expect(dirs).toContain(
      join('C:\\Users\\demo', 'AppData', 'Roaming', 'fnm', 'aliases', 'default')
    )
  })

  it('win32:FNM_DIR 显式覆盖 %APPDATA% 推导,且不再含默认 fnm 路径', () => {
    const dirs = getCliInstallDirs('win32', 'C:\\Users\\demo', { FNM_DIR: 'D:\\fnm-home' })
    expect(dirs).toContain(join('D:\\fnm-home', 'aliases', 'default'))
    expect(dirs).not.toContain(
      join('C:\\Users\\demo', 'AppData', 'Roaming', 'fnm', 'aliases', 'default')
    )
  })

  it('win32:APPDATA 缺省时回退 homePath 拼接,fnm 回退 ~\\.fnm', () => {
    const dirs = getCliInstallDirs('win32', 'C:\\Users\\demo', {})
    expect(dirs).toContain(join('C:\\Users\\demo', '.fnm', 'aliases', 'default'))
  })

  it('非 win32:用户级子集(.local/bin、pnpm、asdf/mise shims),不含 Windows 专属目录', () => {
    const dirs = getCliInstallDirs('linux', '/home/demo', {})
    expect(dirs).toContain(join('/home/demo', '.local', 'bin'))
    expect(dirs).toContain(join('/home/demo', '.local', 'share', 'pnpm'))
    expect(dirs).toContain(join('/home/demo', '.asdf', 'shims'))
    expect(dirs.some((dir) => dir.includes('AppData'))).toBe(false)
  })
})
