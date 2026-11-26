// 会话运行目录的唯一来源(T1):右栏面板根已取它;终端 spawn 的 cwd 待 T2 接入同一来源。
// Why 收成纯函数:目录选择是「有 worktree 用 worktree 路径,否则项目路径」一条规则,
// 界面上任何位置再各算一遍就会漏掉 worktree 会话(面板仍显示项目根、VS Code 打开错目录)。
// 项目必须是该会话所属项目:传错项目只会得到错误的回落路径,函数本身不校验。
import type { Project, Session } from './types'

export function resolveSessionDir(session: Session, project: Project): string {
  // 缺字段与显式 undefined 同义(旧记录 = 普通会话),一条 `??` 覆盖两种
  return session.worktree?.path ?? project.path
}
