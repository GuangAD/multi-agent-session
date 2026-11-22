// 主进程侧的非常规模块声明:vite ?raw 导入(插件包品牌图标 icon.svg 以字符串内联,
// 构建/开发两形态均可用,不依赖运行时 fs 读文件——rolldown 单文件打包下无随包资产)
declare module '*.svg?raw' {
  const content: string
  export default content
}
