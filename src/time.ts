import { moment as obsidianMoment } from 'obsidian'

export interface MomentLike {
  format(fmt?: string): string
  clone(): MomentLike
  add(amount: number, unit: string): MomentLike
  isValid(): boolean
}

type MomentLocale = {
  (): string
  (locale: string): string
}

type MomentFactory = ((input?: string | Date, format?: string, strict?: boolean) => MomentLike) & {
  locale: MomentLocale
}

/**
 * Obsidian 导出的 moment 在类型声明里是命名空间（typeof Moment），
 * 运行时其实是可调用的工厂函数，这里统一收口成可用类型。
 */
export const moment = obsidianMoment as unknown as MomentFactory
