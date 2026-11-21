// 外部编辑器打开编排(spec:T9 落点 src/main/ipc/open-in-editor.ts;files/projects 两域共用)
// 编排非接缝(controller 裁决 5):优先 code 命令(复用 T2 PATH 探测 resolveCommandPath),
// 未装 VS Code 或 code 启动失败(含非零退出/挂死超时)回退系统默认应用。
// Why 无单测:import electron(shell),vitest node 环境跑不了(TDD waiver 先例,行为靠冒烟)。
import { execFile } from 'node:child_process'
import { shell } from 'electron'
import { resolveCommandPath } from '../command-path/command-path-resolver'

// code 启动超时:CLI 挂死时不再等,回退系统默认应用(T9 评审 Minor-2)
const CODE_TIMEOUT_MS = 5000

// 启动 code 打开 target(成功 true)。评审 Critical-1(T8 冒烟后探针坐实):
// Windows 上 resolveCommandPath('code') 按 PATHEXT 命中的是 bin\code.cmd(标准安装只有
// bash 脚本 code 与 code.cmd),而 Node ≥20.12.2 / Electron ≥31(CVE-2024-27980 修复)起,
// execFile 无 shell 执行 .cmd/.bat 恒 EINVAL——「优先 VS Code」分支静默降级永不可达。
// 修法:win32 经 cmd /d /s /c 包装执行(s 的引号规则:整段再包一层引号,内部引号保留),
// windowsVerbatimArguments 必须显式开启——file 为 cmd.exe 时 Node 走标准转义,手写引号会被
// 二次转义破坏(探针实测:含空格路径直拉 EINVAL,不开 verbatim 三种引号形态全败,开启后
// 自造含空格 .cmd 与真实 code --version 全通)。POSIX 无此坑,直拉。
function launchCode(resolved: string, target: string): Promise<boolean> {
  if (process.platform !== 'win32') {
    return execFileQuiet(resolved, [target])
  }
  const comspec = process.env.ComSpec ?? 'cmd.exe'
  return execFileQuiet(comspec, ['/d', '/s', '/c', `""${resolved}" "${target}""`], {
    windowsVerbatimArguments: true
  })
}

// execFile 包装成布尔结果:失败(非零退出/超时/异常)一律 false 由调用方回退,不抛
function execFileQuiet(
  file: string,
  args: string[],
  options: { windowsVerbatimArguments?: boolean } = {}
): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: CODE_TIMEOUT_MS, ...options }, (error) => {
      resolve(error === null)
    })
  })
}

export async function openInEditor(target: string): Promise<{ via: 'vscode' | 'system' }> {
  const resolved = await resolveCommandPath('code')
  if (resolved && (await launchCode(resolved, target))) {
    return { via: 'vscode' }
  }
  // 未命中(code 未装)或启动失败(装了但实例异常/挂死超时,非零退出同判):回退系统默认应用
  await shell.openPath(target)
  return { via: 'system' }
}
