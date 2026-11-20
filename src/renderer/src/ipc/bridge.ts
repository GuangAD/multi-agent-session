// window.api 类型化封装,渲染层唯一入口(AGENTS.md:渲染层永不 import main,一切经 bridge)
import type { AppApi } from '../../../shared/ipc-contract'

export const bridge: AppApi = window.api
