// 非接缝 readFilePreview 守卫用例(controller 裁决 8:非接缝契约口径不加用例,但截断/二进制
// 嗅探/clamp 是具体数值行为,判断值得防回归,故加;期望值来自契约裁决 4 的公式与手算输入)
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readFilePreview } from './file-content'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function makeTempFile(name: string, data: string | Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'file-content-'))
  tempRoots.push(dir)
  const file = join(dir, name)
  await writeFile(file, data)
  return file
}

describe('readFilePreview(单句柄读取 + 二进制探测 + 截断)', () => {
  it('文本全量读:size ≤ maxBytes 一次读完,truncated=false', async () => {
    const file = await makeTempFile('a.txt', '你好 file-content')
    const result = await readFilePreview({ path: file, maxBytes: 1000 })
    expect(result).toEqual({ content: '你好 file-content', truncated: false, binary: false })
  })

  it('超限截断:只读前 maxBytes 字节,truncated=true', async () => {
    const file = await makeTempFile('big.txt', 'x'.repeat(100))
    const result = await readFilePreview({ path: file, maxBytes: 10 })
    // 手算:前 10 字节全为 x
    expect(result.content).toBe('x'.repeat(10))
    expect(result.truncated).toBe(true)
    expect(result.binary).toBe(false)
  })

  it('二进制嗅探:前 8KB 含 NUL 字节 → binary=true 且 content 为空串(不渲染乱码)', async () => {
    // MZ 头(Windows PE)+ NUL,经典二进制开头
    const file = await makeTempFile('app.bin', Buffer.from([0x4d, 0x5a, 0x00, 0x01, 0xff]))
    const result = await readFilePreview({ path: file, maxBytes: 1000 })
    expect(result.binary).toBe(true)
    expect(result.content).toBe('')
  })

  it('嗅探窗口只看前 8192 字节:NUL 在窗口外不算二进制', async () => {
    const payload = Buffer.concat([Buffer.alloc(8192, 0x61), Buffer.from([0x00])])
    const file = await makeTempFile('late-nul.bin', payload)
    const result = await readFilePreview({ path: file, maxBytes: 100000 })
    expect(result.binary).toBe(false)
    expect(result.truncated).toBe(false)
  })

  it('maxBytes clamp(裁决 4):0 按下限 1 处理,超出按上限封顶不炸', async () => {
    const file = await makeTempFile('c.txt', 'abc')
    const below = await readFilePreview({ path: file, maxBytes: 0 })
    // clamp 到 1:只读首字节,且 3 > 1 → truncated
    expect(below.content).toBe('a')
    expect(below.truncated).toBe(true)

    const above = await readFilePreview({ path: file, maxBytes: 5_000_000 })
    expect(above.content).toBe('abc')
    expect(above.truncated).toBe(false)
  })

  it('错误行为:文件不存在/是目录 → 返回 { error } 结构化错误,不抛未捕获异常', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'file-content-'))
    tempRoots.push(dir)
    const missing = await readFilePreview({ path: join(dir, 'no-such-file.txt'), maxBytes: 100 })
    expect(typeof missing.error).toBe('string')
    expect(missing.error?.length).toBeGreaterThan(0)
    expect(missing.content).toBe('')

    const onDir = await readFilePreview({ path: dir, maxBytes: 100 })
    expect(typeof onDir.error).toBe('string')
    expect(onDir.error?.length).toBeGreaterThan(0)
  })
})
