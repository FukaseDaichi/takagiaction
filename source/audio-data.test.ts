import { describe, expect, it } from 'vitest'
import { music_dark_meat_beat } from './music-dark-meat-beat'
import {
  sound_beep, sound_explode, sound_hit, sound_hurt,
  sound_pickup, sound_shoot, sound_terminal,
} from './sound-effects'

// 値そのものを固定する。差分が出たら git diff で何が変わったか分かる。
// node:crypto ではなく Web Crypto を使う。@types/node を入れずに済み、
// setTimeout などの型が Node 版に切り替わって既存コードを壊すこともない。
async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)
}

const patches = {
  sound_terminal, sound_shoot, sound_hit, sound_beep,
  sound_hurt, sound_pickup, sound_explode,
}

describe('音色データ', () => {
  it('各パッチが 29 フィールドを持つ', () => {
    // sonantx-reduced.js が instr.xxx として読むフィールド数と一致する。
    // 打ち間違いでフィールドが増減すると無音で失敗するため件数を固定する。
    for (const [name, patch] of Object.entries(patches)) {
      expect(Object.keys(patch).length, name).toBe(29)
    }
  })

  it('効果音の値が変わっていない', async () => {
    expect(await digest(sound_terminal)).toBe('e6106576030ff855')
    expect(await digest(sound_shoot)).toBe('64dc2fceb503978d')
    expect(await digest(sound_hit)).toBe('d0f60664325a8797')
    expect(await digest(sound_beep)).toBe('90ba85f337bce63a')
    expect(await digest(sound_hurt)).toBe('8102f3ff635efb7f')
    expect(await digest(sound_pickup)).toBe('e9ad4184c166d682')
    expect(await digest(sound_explode)).toBe('3559d26edf0180a6')
  })

  it('楽曲の構造と値が変わっていない', async () => {
    expect(music_dark_meat_beat.rowLen).toBe(5513)
    expect(music_dark_meat_beat.endPattern).toBe(25)
    expect(music_dark_meat_beat.songLen).toBe(101)
    expect(music_dark_meat_beat.songData.length).toBe(6)
    expect(await digest(music_dark_meat_beat)).toBe('020050e12cd39d48')
  })
})
