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
  const music_boss = { music_boss: true }
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
        // 曲の切替（music_start）が前の source を止めてから作り直すため必要
        stop: () => {},
      }
      return source
    },
  }
  const globals = globalThis as Record<string, unknown>
  globals.AudioContext = function () { return ctx }
  globals.location = { hostname: 'example.com' }
  return { ctx, started, gains, filters, music, music_boss, song_calls: 0, skip_boss_song: false }
})

vi.mock('./sonantx-reduced', () => ({
  // 1 曲目が通常BGM、2 曲目がボス曲（audio.ts の生成順）
  sonantxr_generate_song: (_ctx: unknown, _song: unknown, cb: (b: unknown) => void) => {
    fake.song_calls++
    // ボス曲の生成は起動の臨界パスから外してあるので、最初のボス階に
    // 間に合っていない可能性がある。その経路を作るためコールバックを呼ばない
    if (fake.song_calls === 2 && fake.skip_boss_song) { return }
    cb(fake.song_calls === 1 ? fake.music : fake.music_boss)
  },
  sonantxr_generate_sound: (_ctx: unknown, _inst: unknown, _note: number, cb: (b: unknown) => void) => {
    cb({})
  },
}))
vi.mock('./terminal', () => ({ terminal_show_notice: () => {} }))

// 各テストは vi.resetModules() の後に audio を import し直す（下記 load_audio）。
// その import をテスト本体で初めて行うと、モジュールグラフの取得と変換のコストが
// per-test の 5000ms 予算に乗る。並列実行の負荷が高いと先頭テストだけで 3.5〜4.2 秒を
// 使い、まれにタイムアウトしていた。ここで一度読んで collect フェーズへ前倒しする
// （minimap.test.ts がトップレベルで import しているのと同じ理由）
import './audio'

// audio_unlocked はモジュール変数なので、テストごとにモジュールを読み直して
// 「解錠前」の状態から始める
async function load_audio(options: { boss_song?: boolean } = {}) {
  vi.resetModules()
  fake.started.length = 0
  fake.gains.length = 0
  fake.filters.length = 0
  fake.ctx.resume_count = 0
  fake.ctx.state = 'suspended'
  fake.song_calls = 0
  fake.skip_boss_song = options.boss_song === false
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

describe('ボス階のBGM', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('ボス曲へ切り替えると、その曲をループ再生で鳴らす', async () => {
    const audio = await load_audio()
    audio.audio_unlock()
    fake.started.length = 0

    audio.audio_music_boss()

    expect(fake.started.length).toBe(1)
    expect(fake.started[0].buffer).toBe(fake.music_boss)
    expect(fake.started[0].loop).toBe(true)
    // 差し替えのポップを避けるための音量ランプ。ctx.currentTime = 7、
    // music_swap_ramp は 0.25 秒
    expect(fake.gains[1].gain.calls).toContainEqual(['linear', 1, 7.25])
  })

  it('通常曲へ戻すと、通常曲を鳴らす', async () => {
    const audio = await load_audio()
    audio.audio_unlock()
    audio.audio_music_boss()
    fake.started.length = 0

    audio.audio_music_normal()

    expect(fake.started.length).toBe(1)
    expect(fake.started[0].buffer).toBe(fake.music)
  })

  it('同じ曲への切替は鳴らし直さない（ループの頭出しが起きない）', async () => {
    const audio = await load_audio()
    audio.audio_unlock()
    audio.audio_music_boss()
    fake.started.length = 0

    audio.audio_music_boss()

    expect(fake.started.length).toBe(0)
  })

  it('激昂で再生レートを上げる', async () => {
    const audio = await load_audio()
    audio.audio_unlock()
    audio.audio_music_boss()
    const rate = fake.started[fake.started.length - 1].playbackRate

    audio.audio_music_boss_rage()

    // ctx.currentTime = 7、ランプは 0.6 秒
    expect(rate.calls).toContainEqual(['linear', 1.12, 7.6])
  })

  it('ラン開始の復帰で通常曲へ戻し、レートを 1 にする', async () => {
    const audio = await load_audio()
    audio.audio_unlock()
    audio.audio_music_boss()
    audio.audio_music_boss_rage()
    fake.started.length = 0

    audio.audio_music_restore()

    expect(fake.started.length).toBe(1)
    expect(fake.started[0].buffer).toBe(fake.music)
    expect(fake.started[0].playbackRate.value).toBe(1)
  })

  it('解錠前は切り替えても鳴らさない', async () => {
    const audio = await load_audio()

    audio.audio_music_boss()

    expect(fake.started.length).toBe(0)
  })

  // ボス曲が間に合わなかったときの経路。audio.ts はそこを「通常BGMのまま
  // 続ける」と設計しているので、その後始末（レートを戻すこと）まで含めて固定する
  it('ボス曲が未生成でも、撃破後に激昂のレートが通常曲へ残らない', async () => {
    const audio = await load_audio({ boss_song: false })
    audio.audio_unlock()
    // 通常曲の source。以下ずっとこれが鳴り続ける
    expect(fake.started.length).toBe(1)
    const rate = fake.started[0].playbackRate

    // ボス階へ入るが、ボス曲は未生成なので鳴らし直しは起きない
    audio.audio_music_boss()
    expect(fake.started.length).toBe(1)

    // 激昂のレートは「通常曲」の source に乗る
    audio.audio_music_boss_rage()
    expect(rate.calls).toContainEqual(['linear', 1.12, 7.6])

    // 撃破で通常BGMへ。バッファが同じなので source は作り直されない ——
    // だからレートを明示的に戻さないと 1.12 のままランが続く
    audio.audio_music_normal()
    expect(fake.started.length).toBe(1)
    // 予約済みのランプを捨ててから即時値の 1 で上書きしていること。
    // rate.value だけを見る形にしないのは、この fake の linearRamp が value を
    // 動かさないため（戻し忘れても value は 1 のままで、赤くならない）
    expect(rate.calls.slice(-2)).toEqual([['cancel', 0, 7], ['set', 1, 7]])
  })
})

describe('OP 用の再生口', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('解錠前は何も鳴らさず no-op の stop を返す', async () => {
    const audio = await load_audio()
    const before = fake.started.length

    const stop = audio.audio_play_op({} as AudioBuffer, 0.4)

    expect(fake.started.length).toBe(before)
    stop() // 投げないこと
  })

  it('レート・音量・ループを指定して鳴らす', async () => {
    const audio = await load_audio()
    audio.audio_unlock()
    const before = fake.started.length

    const stop = audio.audio_play_op({} as AudioBuffer, 0.25, 0.4, true)

    expect(fake.started.length).toBe(before + 1)
    const started = fake.started[fake.started.length - 1]
    expect(started.loop).toBe(true)
    expect(started.playbackRate.value).toBe(0.25)
    // 専用 GainNode を作って音量を載せている
    const gain = fake.gains[fake.gains.length - 1]
    expect(gain.gain.value).toBe(0.4)
    stop()
    stop() // 二重 stop も投げないこと（元 stub の stop は no-op なので、投げないこと自体はこのテストでは確認できない）
  })

  it('再生が終わった source への二重 stop でも投げない', async () => {
    const audio = await load_audio()
    audio.audio_unlock() // BGM の source は元の stub で作らせる

    const original = fake.ctx.createBufferSource
    // 元の source をそのまま作り、stop だけを「2 回目で投げる」ものに差し替える。
    // 実物の AudioBufferSourceNode は再生終了後の stop() で InvalidStateError を投げるため、
    // audio_play_op の try/catch がその経路を握っていることをここで確かめる
    fake.ctx.createBufferSource = () => {
      const source = original()
      let stopped = false
      source.stop = () => {
        if (stopped) { throw new Error('InvalidStateError') }
        stopped = true
      }
      return source
    }
    try {
      const stop = audio.audio_play_op({} as AudioBuffer, 0.4)
      stop()
      expect(() => { stop() }).not.toThrow()
    } finally {
      fake.ctx.createBufferSource = original
    }
  })
})
