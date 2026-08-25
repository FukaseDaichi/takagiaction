import { describe, expect, it } from 'vitest'
import { music_dark_meat_beat } from './music-dark-meat-beat'
import { music_boss } from './music-boss'
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

  // JSON.stringify の出力をハッシュしているため、値が同じでもキーの順序が
  // 変わるだけでも落ちる。落ちたときは音自体が変わったのか、フィールドの
  // 順序が変わっただけなのかを diff（git diff や実際の値の比較）で確認すること。
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

  it('ボス曲の構造が通常曲と揃っている', () => {
    // 生成側（sonantx-reduced.js）が読む形は 2 曲で同じでなければならない
    expect(music_boss.songData.length).toBe(music_dark_meat_beat.songData.length)
    expect(music_boss.songLen).toBe(music_dark_meat_beat.songLen)
    expect(music_boss.endPattern).toBe(music_dark_meat_beat.endPattern)
    for (const instr of music_boss.songData) {
      // ブリーフは「既存パッチの 29 から p と c を除いた 27」と想定していたが、
      // 実測ではスカラーフィールドは 29 個（既存パッチと同じ 29 個の音色
      // パラメータ）で、p と c はその上に追加される（合計 31 キー）。
      // 実測値を固定する。
      expect(Object.keys(instr).filter((k) => k !== 'p' && k !== 'c').length).toBe(29)
    }
  })

  it('ボス曲が通常曲と別物である', () => {
    // 複製したまま名前だけ変えた状態を防ぐ
    expect(music_boss.rowLen).not.toBe(music_dark_meat_beat.rowLen)
  })

  it('ボス曲の値が変わっていない', async () => {
    // 落ちたときは git diff で何が変わったかを確認する。値を意図して
    // 変えたなら、ここのハッシュを新しい値に差し替える。
    // ↓ この 16 桁は Step 5 で実測値に置き換える。既存の 7 パッチと
    //   同じ「値そのものを固定する」テスト（このファイル冒頭のコメント）
    expect(await digest(music_boss)).toBe('9f06bb7a5df96aee')
  })
})
