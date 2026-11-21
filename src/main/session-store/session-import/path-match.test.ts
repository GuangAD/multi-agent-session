// 接缝 matchProjectDir 模块行为测试(契约「测试规格」第 1–3 条)
// 期望值来源:手算(归一化规则:分隔符统一、Windows 路径忽略大小写、去尾分隔符)+ 构造反例;纯函数,不碰 fs。
import { describe, expect, it } from 'vitest'
import { matchProjectDir } from './path-match'

describe('matchProjectDir', () => {
  it('1. cwd 与项目路径一致 → 命中(含反斜杠/正斜杠混写与尾分隔符)', () => {
    expect(matchProjectDir('D:\\work\\myapp', 'D:\\work\\myapp')).toBe(true)
    // 去尾分隔符:两侧都归一化后再比
    expect(matchProjectDir('D:\\work\\myapp\\', 'D:\\work\\myapp')).toBe(true)
    // 分隔符统一:agent 侧记的是正斜杠,项目路径是反斜杠
    expect(matchProjectDir('D:/work/myapp', 'D:\\work\\myapp')).toBe(true)
  })

  it('2. 仅大小写不同(d:/X vs D:/x)→ 命中;非 Windows 路径不折叠大小写', () => {
    expect(matchProjectDir('d:/X', 'D:/x')).toBe(true)
    expect(matchProjectDir('d:\\projects\\MyApp', 'D:\\Projects\\myapp')).toBe(true)
    // 构造反例:POSIX 路径下大小写不同是两个目录,不得因折叠误命中
    expect(matchProjectDir('/home/Foo', '/home/foo')).toBe(false)
  })

  it('3. 其他目录的会话 → 排除(构造反例:兄弟目录 / 前缀相近 / 子目录)', () => {
    expect(matchProjectDir('D:\\work\\other', 'D:\\work\\myapp')).toBe(false)
    expect(matchProjectDir('D:\\work\\myapp2', 'D:\\work\\myapp')).toBe(false)
    // 只做精确匹配:项目子目录的会话不属于该项目
    expect(matchProjectDir('D:\\work\\myapp\\sub', 'D:\\work\\myapp')).toBe(false)
  })
})
