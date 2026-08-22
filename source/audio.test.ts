import { beforeEach, describe, expect, it, vi } from 'vitest'

// audio.ts はモジュール初期化時に new AudioContext() と location.hostname を触る。
// vi.hoisted は import より前に走るので、そこで両方を差し替える。
const fake = vi.hoisted(() => {
  const started: Array<{ buffer: unknown, loop: boolean }> = []
  const music = { music: true }
  const ctx = {
    state: 'suspended',
    resume_count: 0,
    destination: {},
    resume(): void {
      ctx.resume_count++
      ctx.state = 'running'
    },
    createGain: () => ({ gain: { value: 0 }, connect: () => {} }),
    createBufferSource: () => {
      const source = {
        buffer: null as unknown,
        loop: false,
        connect: () => {},
        start: () => { started.push({ buffer: source.buffer, loop: source.loop }) },
      }
      return source
    },
  }
  const globals = globalThis as Record<string, unknown>
  globals.AudioContext = function () { return ctx }
  globals.location = { hostname: 'example.com' }
  return { ctx, started, music }
})

vi.mock('./sonantx-reduced', () => ({
  sonantxr_generate_song: (_ctx: unknown, _song: unknown, cb: (b: unknown) => void) => {
    cb(fake.music)
  },
  sonantxr_generate_sound: (_ctx: unknown, _inst: unknown, _note: number, cb: (b: unknown) => void) => {
    cb({})
  },
}))
vi.mock('./terminal', () => ({ terminal_show_notice: () => {} }))

// audio_unlocked はモジュール変数なので、テストごとにモジュールを読み直して
// 「解錠前」の状態から始める
async function load_audio() {
  vi.resetModules()
  fake.started.length = 0
  fake.ctx.resume_count = 0
  fake.ctx.state = 'suspended'
  const audio = await import('./audio')
  audio.audio_init(() => {})
  return audio
}

describe('音声の初回解錠', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('解錠前は resume() も再生もしない', async () => {
    const audio = await load_audio()

    // イントロのタイピング音に相当する呼び出し。suspended のまま start() すると
    // resume() の瞬間にまとめて鳴るため、ここでは何も鳴らしてはいけない
    audio.audio_play(audio.audio_sfx_terminal)
    audio.audio_play(audio.audio_sfx_beep)

    expect(fake.ctx.resume_count).toBe(0)
    expect(fake.started.length).toBe(0)
  })

  it('解錠で resume() を呼び、BGM をループ再生で始める', async () => {
    const audio = await load_audio()

    audio.audio_unlock()

    expect(fake.ctx.resume_count).toBe(1)
    expect(fake.started).toEqual([{ buffer: fake.music, loop: true }])
  })

  it('解錠後は効果音が鳴る', async () => {
    const audio = await load_audio()

    audio.audio_unlock()
    fake.started.length = 0
    audio.audio_play(audio.audio_sfx_beep)

    expect(fake.started.length).toBe(1)
    expect(fake.started[0].buffer).toBe(audio.audio_sfx_beep)
    expect(fake.started[0].loop).toBe(false)
  })
})
