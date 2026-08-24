import { beforeEach, describe, expect, it, vi } from 'vitest'

// audio.ts はモジュール初期化時に new AudioContext() と location.hostname を触る。
// vi.hoisted は import より前に走るので、そこで両方を差し替える。
const fake = vi.hoisted(() => {
  // AudioParam のスケジューリングを [メソッド, 値, 時刻] で記録する
  interface param_t {
    value: number
    calls: Array<[string, number, number]>
    setValueAtTime(v: number, t: number): void
    linearRampToValueAtTime(v: number, t: number): void
    exponentialRampToValueAtTime(v: number, t: number): void
    cancelScheduledValues(t: number): void
  }
  const make_param = (value: number): param_t => ({
    value,
    calls: [],
    setValueAtTime(v, t) { this.calls.push(['set', v, t]); this.value = v },
    linearRampToValueAtTime(v, t) { this.calls.push(['linear', v, t]) },
    exponentialRampToValueAtTime(v, t) { this.calls.push(['exp', v, t]) },
    cancelScheduledValues(t) { this.calls.push(['cancel', 0, t]) },
  })
  const started:
    Array<{ buffer: unknown, loop: boolean, playbackRate: param_t, start_at: number }> = []
  const gains: Array<{ gain: param_t }> = []
  const filters: Array<{ type: string, frequency: param_t }> = []
  const music = { music: true }
  const ctx = {
    state: 'suspended',
    currentTime: 7,
    resume_count: 0,
    destination: {},
    resume(): void {
      ctx.resume_count++
      ctx.state = 'running'
    },
    createGain: () => {
      const gain = { gain: make_param(0), connect: () => {} }
      gains.push(gain)
      return gain
    },
    createBiquadFilter: () => {
      const filter = { type: '', frequency: make_param(350), connect: () => {} }
      filters.push(filter)
      return filter
    },
    createBufferSource: () => {
      const source = {
        buffer: null as unknown,
        loop: false,
        playbackRate: make_param(1),
        connect: () => {},
        start: (when: number) => {
          started.push({
            buffer: source.buffer, loop: source.loop, playbackRate: source.playbackRate,
            start_at: when,
          })
        },
      }
      return source
    },
  }
  const globals = globalThis as Record<string, unknown>
  globals.AudioContext = function () { return ctx }
  globals.location = { hostname: 'example.com' }
  return { ctx, started, gains, filters, music }
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
  fake.gains.length = 0
  fake.filters.length = 0
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
    expect(fake.started.length).toBe(1)
    expect(fake.started[0].buffer).toBe(fake.music)
    expect(fake.started[0].loop).toBe(true)
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

// entity-boss.ts が撃破音を時間差で重ねるために足した引数。start() に渡す
// スケジュール時刻が currentTime を基準に正しくずれることを見る
// （3 連発という呼び出し側の選択自体は entity-boss.ts のコメントで説明する
// 定数であり、ここではプリミティブの計算だけを見る）
describe('効果音の再生タイミング', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('delay を省略すると currentTime に即時再生する', async () => {
    const audio = await load_audio()
    audio.audio_unlock()
    fake.started.length = 0

    audio.audio_play(audio.audio_sfx_beep)

    expect(fake.started[0].start_at).toBe(fake.ctx.currentTime)
  })

  it('delay を渡すと currentTime からその秒数だけ遅らせる', async () => {
    const audio = await load_audio()
    audio.audio_unlock()
    fake.started.length = 0

    audio.audio_play(audio.audio_sfx_explode, false, 0.09)
    audio.audio_play(audio.audio_sfx_explode, false, 0.18)

    expect(fake.started[0].start_at).toBe(fake.ctx.currentTime + 0.09)
    expect(fake.started[1].start_at).toBe(fake.ctx.currentTime + 0.18)
  })
})

describe('BGM のテープストップ', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('死亡でレートを 1.5 秒かけて 0.4 へ、音量を 3 秒かけて 0 へ落とす', async () => {
    const audio = await load_audio()
    audio.audio_unlock()
    const rate = fake.started[0].playbackRate
    // BGM 専用チェーンの gain。gains[0] はマスター（モジュール初期化順）
    const music_gain = fake.gains[1].gain
    const freq = fake.filters[0].frequency

    audio.audio_music_death()

    // ctx.currentTime = 7 なので、テープストップ終端は 8.5、消音は 10
    expect(rate.calls).toContainEqual(['linear', 0.4, 8.5])
    expect(music_gain.calls).toContainEqual(['linear', 0, 10])
    // フィルタは聴感に合わせて指数で落とす（線形だと最後の一瞬でこもって聞こえる）
    expect(freq.calls).toContainEqual(['exp', 200, 8.5])
  })

  it('復帰でレート・フィルタ・音量を即座に元へ戻す', async () => {
    const audio = await load_audio()
    audio.audio_unlock()
    audio.audio_music_death()

    audio.audio_music_restore()

    const rate = fake.started[0].playbackRate
    const music_gain = fake.gains[1].gain
    const freq = fake.filters[0].frequency
    // 予約済みのランプを捨ててから即時値で戻す
    expect(rate.calls[rate.calls.length - 2]).toEqual(['cancel', 0, 7])
    expect(rate.value).toBe(1)
    expect(music_gain.value).toBe(1)
    expect(freq.value).toBe(20000)
  })

  it('解錠前（BGM 未再生）は死亡でも何も予約しない', async () => {
    const audio = await load_audio()

    audio.audio_music_death()

    expect(fake.gains[1].gain.calls.length).toBe(0)
    expect(fake.filters[0].frequency.calls.length).toBe(0)
  })
})
