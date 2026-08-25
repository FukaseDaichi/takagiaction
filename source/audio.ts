import { sonantxr_generate_song, sonantxr_generate_sound } from './sonantx-reduced'
import { death_duration, death_tape_stop_duration } from './death-sequence-model'
import { music_dark_meat_beat } from './music-dark-meat-beat'
import { music_boss } from './music-boss'
import {
  sound_beep, sound_door, sound_exhale, sound_explode, sound_hit, sound_hurt,
  sound_lighter, sound_pickup, sound_shoot, sound_swing, sound_terminal,
} from './sound-effects'
import { state } from './state'
import { terminal_show_notice } from './terminal'

const audio_ctx = new AudioContext()
const audio_gain = audio_ctx.createGain()

// BGM 専用チェーン: music_source → music_gain → music_filter → audio_gain。
// 死亡シーケンスのテープストップ（回転落ち）でレート・音量・フィルタを個別に
// 操作するため、効果音（audio_gain 直結）から分離する
const music_gain = audio_ctx.createGain()
const music_filter = audio_ctx.createBiquadFilter()
// BiquadFilter の frequency 既定値は 350Hz。通常再生でこもらないよう開いておく
const music_filter_open_hz = 20000
// 激昂の再生レートと、そこへ寄せる時間（秒）。1.12 はテンポとピッチが
// 「上がった」と分かり、かつ曲が破綻しない幅。レート操作は死亡の
// テープストップで既に使っている経路なので、新しい仕組みが要らない
const music_rage_rate = 1.12
const music_rage_ramp = 0.6
// 曲を差し替えるときのランプ（秒）。ポップを避けるためだけの短い長さ
const music_swap_ramp = 0.25
let music_source: AudioBufferSourceNode | undefined

// ローカル（localhost / 127.0.0.1 / file://）では既定でミュート
let audio_enabled = ['localhost', '127.0.0.1', ''].indexOf(location.hostname) === -1

export let audio_sfx_shoot: AudioBuffer | undefined
export let audio_sfx_hit: AudioBuffer | undefined
export let audio_sfx_hurt: AudioBuffer | undefined
export let audio_sfx_beep: AudioBuffer | undefined
export let audio_sfx_pickup: AudioBuffer | undefined
export let audio_sfx_terminal: AudioBuffer | undefined
export let audio_sfx_explode: AudioBuffer | undefined
export let audio_sfx_lighter: AudioBuffer | undefined
export let audio_sfx_exhale: AudioBuffer | undefined
export let audio_sfx_door: AudioBuffer | undefined
export let audio_sfx_swing: AudioBuffer | undefined

// 自動再生ポリシーの下では、ユーザー操作より前に生成した AudioContext は
// suspended で始まり、操作があっても自動では再開されない。suspended のまま
// start() したソースは context の時計が止まっているため resume() の瞬間に
// まとめて鳴る（イントロのタイピング音 100 発以上が一斉に出る）。
// そのため audio_unlock() までは何も鳴らさず、BGM の開始もそこまで遅らせる。
// 判定に audio_ctx.state を使わないのは、Chrome では resume() の直後に同期で
// 読んでもまだ 'suspended' のままで、BGM 自身が落ちてしまうため
let audio_unlocked = false
let audio_music: AudioBuffer | undefined
// ボス階専用のBGM。通常BGMの生成が終わってから続けて生成を始めるので、
// 起動の臨界パス（audio_init のコールバックがゲーム開始のクリックハンドラを
// 張る経路）には載らない。最初のボス階（深度 5）に着くのは数分後なので
// 実際に間に合わないことはないが、未生成なら通常BGMのまま続ける
let audio_music_boss_buffer: AudioBuffer | undefined
// 今鳴っている曲のバッファ。同じ曲への切替を鳴らし直さないために持つ
// （鳴らし直すとループの頭出しが起きて、フロアを跨ぐたび曲が巻き戻る）
let music_current: AudioBuffer | undefined

audio_gain.gain.value = audio_enabled ? 1 : 0
audio_gain.connect(audio_ctx.destination)

music_gain.gain.value = 1
music_filter.type = 'lowpass'
music_filter.frequency.value = music_filter_open_hz
music_gain.connect(music_filter)
music_filter.connect(audio_gain)

export function audio_init(callback: () => void): void {
  sonantxr_generate_song(audio_ctx, music_dark_meat_beat, (buffer) => {
    audio_music = buffer
    callback()
    // 通常BGMが出来てから続けてボス曲を生成する。同時に走らせると
    // （MusicGenerator は setTimeout で刻む）1 曲目の完成が遅れ、起動が伸びる
    sonantxr_generate_song(audio_ctx, music_boss, (boss) => {
      audio_music_boss_buffer = boss
    })
  })
  sonantxr_generate_sound(audio_ctx, sound_shoot, 140, (b) => { audio_sfx_shoot = b })
  sonantxr_generate_sound(audio_ctx, sound_hit, 134, (b) => { audio_sfx_hit = b })
  sonantxr_generate_sound(audio_ctx, sound_beep, 173, (b) => { audio_sfx_beep = b })
  sonantxr_generate_sound(audio_ctx, sound_hurt, 144, (b) => { audio_sfx_hurt = b })
  sonantxr_generate_sound(audio_ctx, sound_pickup, 156, (b) => { audio_sfx_pickup = b })
  sonantxr_generate_sound(audio_ctx, sound_terminal, 156, (b) => { audio_sfx_terminal = b })
  sonantxr_generate_sound(audio_ctx, sound_explode, 114, (b) => { audio_sfx_explode = b })
  sonantxr_generate_sound(audio_ctx, sound_lighter, 160, (b) => { audio_sfx_lighter = b })
  sonantxr_generate_sound(audio_ctx, sound_exhale, 140, (b) => { audio_sfx_exhale = b })
  sonantxr_generate_sound(audio_ctx, sound_door, 110, (b) => { audio_sfx_door = b })
  sonantxr_generate_sound(audio_ctx, sound_swing, 140, (b) => { audio_sfx_swing = b })
}

// ユーザー操作起点で AudioContext を再開し、BGM を鳴らし始める。
// main.ts のゲーム開始クリック（ページ唯一の必須ジェスチャ）から呼ぶ
export function audio_unlock(): void {
  audio_unlocked = true
  audio_ctx.resume()
  music_start(audio_music)
}

// BGM は audio_play()（効果音チェーン直結）ではなく専用チェーンで鳴らす。
// 同じ曲なら何もしない — 鳴らし直すとループの頭出しが起きて、フロアを
// 跨ぐたび曲が巻き戻る
function music_start(buffer: AudioBuffer | undefined): void {
  if (!audio_unlocked || !buffer || buffer === music_current) { return }
  const now = audio_ctx.currentTime
  music_source?.stop()
  music_current = buffer
  music_source = audio_ctx.createBufferSource()
  music_source.buffer = buffer
  music_source.loop = true
  music_source.connect(music_gain)
  // 差し替えのポップを避けるためだけの短いランプ。0 から立ち上げる
  const gain = music_gain.gain
  gain.cancelScheduledValues(now)
  gain.setValueAtTime(0, now)
  gain.linearRampToValueAtTime(1, now + music_swap_ramp)
  music_source.start()
}

// ボス階のロードで呼ぶ。生成が間に合っていなければ通常BGMのまま続ける
export function audio_music_boss(): void {
  music_start(audio_music_boss_buffer)
}

// ボス撃破とボス階以外のロードで呼ぶ
export function audio_music_normal(): void {
  music_start(audio_music)
}

// 激昂。テンポとピッチを上げる
export function audio_music_boss_rage(): void {
  if (!music_source) { return }
  const now = audio_ctx.currentTime
  const rate = music_source.playbackRate
  rate.cancelScheduledValues(now)
  rate.setValueAtTime(rate.value, now)
  rate.linearRampToValueAtTime(music_rage_rate, now + music_rage_ramp)
}

// 死亡シーケンスの BGM 演出。テープストップ（レートとローパスを 1.5 秒で落とす）
// ののち、シーケンス終端（3 秒）に向けて音量を 0 へ。死亡画面は無音になる
// （ドローンに運ばれて地下の音が遠ざかった、という理屈。docs/story.md）
export function audio_music_death(): void {
  if (!music_source) { return }
  const now = audio_ctx.currentTime
  const stop_at = now + death_tape_stop_duration
  const rate = music_source.playbackRate
  rate.cancelScheduledValues(now)
  rate.setValueAtTime(rate.value, now)
  rate.linearRampToValueAtTime(0.4, stop_at)
  const freq = music_filter.frequency
  freq.cancelScheduledValues(now)
  freq.setValueAtTime(music_filter_open_hz, now)
  // 周波数は聴感が対数なので指数で落とす（線形だと最後の一瞬でこもって聞こえる）
  freq.exponentialRampToValueAtTime(200, stop_at)
  const gain = music_gain.gain
  gain.cancelScheduledValues(now)
  gain.setValueAtTime(gain.value, now)
  gain.linearRampToValueAtTime(0, now + death_duration)
}

// 次のラン開始で通常再生へ即時復帰する（run_start が呼ぶ）。
// バッファも戻すのが要る — レートとフィルタと音量だけ戻すと、ボス階で
// 死んだ次のランがボス曲で始まる
export function audio_music_restore(): void {
  const now = audio_ctx.currentTime
  music_filter.frequency.cancelScheduledValues(now)
  music_filter.frequency.setValueAtTime(music_filter_open_hz, now)
  music_gain.gain.cancelScheduledValues(now)
  music_gain.gain.setValueAtTime(1, now)
  if (music_source) {
    const rate = music_source.playbackRate
    rate.cancelScheduledValues(now)
    rate.setValueAtTime(1, now)
  }
  // 現在の曲がボス曲なら通常曲へ戻す。music_start() が同一なら何もしない
  audio_music_normal()
}

// delay（秒）は同じ音を時間差で重ねる用途専用（entity-boss.ts の撃破音）。
// 既定 0 なら currentTime + 0 = currentTime で、即時再生と挙動は変わらない
export function audio_play(buffer: AudioBuffer | undefined, loop = false, delay = 0): void {
  if (!audio_unlocked) { return }
  // このガードは AudioBuffer | undefined という型を満たすためのもの。
  // 効果音は sonantxr_generate_sound が同期的にコールバックを呼ぶため
  // audio_init が返る時点で埋まっており、実行時に undefined で呼ばれる経路はない。
  if (!buffer) { return }
  const source = audio_ctx.createBufferSource()
  source.buffer = buffer
  source.loop = loop
  source.connect(audio_gain)
  source.start(audio_ctx.currentTime + delay)
}

export function audio_toggle(): void {
  audio_enabled = !audio_enabled
  audio_gain.gain.value = audio_enabled ? 1 : 0
  // イントロ／エンディング中は通知でテキスト表示チェーンを壊してしまうので出さない
  if (state.game_running) {
    terminal_show_notice(audio_enabled ? '音声: ON' : '音声: OFF')
  }
}
