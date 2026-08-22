import { sonantxr_generate_song, sonantxr_generate_sound } from './sonantx-reduced'
import { music_dark_meat_beat } from './music-dark-meat-beat'
import {
  sound_beep, sound_explode, sound_hit, sound_hurt,
  sound_pickup, sound_shoot, sound_terminal,
} from './sound-effects'
import { state } from './state'
import { terminal_show_notice } from './terminal'

const audio_ctx = new AudioContext()
const audio_gain = audio_ctx.createGain()

// ローカル（localhost / 127.0.0.1 / file://）では既定でミュート
let audio_enabled = ['localhost', '127.0.0.1', ''].indexOf(location.hostname) === -1

export let audio_sfx_shoot: AudioBuffer | undefined
export let audio_sfx_hit: AudioBuffer | undefined
export let audio_sfx_hurt: AudioBuffer | undefined
export let audio_sfx_beep: AudioBuffer | undefined
export let audio_sfx_pickup: AudioBuffer | undefined
export let audio_sfx_terminal: AudioBuffer | undefined
export let audio_sfx_explode: AudioBuffer | undefined

// 自動再生ポリシーの下では、ユーザー操作より前に生成した AudioContext は
// suspended で始まり、操作があっても自動では再開されない。suspended のまま
// start() したソースは context の時計が止まっているため resume() の瞬間に
// まとめて鳴る（イントロのタイピング音 100 発以上が一斉に出る）。
// そのため audio_unlock() までは何も鳴らさず、BGM の開始もそこまで遅らせる。
// 判定に audio_ctx.state を使わないのは、Chrome では resume() の直後に同期で
// 読んでもまだ 'suspended' のままで、BGM 自身が落ちてしまうため
let audio_unlocked = false
let audio_music: AudioBuffer | undefined

audio_gain.gain.value = audio_enabled ? 1 : 0
audio_gain.connect(audio_ctx.destination)

export function audio_init(callback: () => void): void {
  sonantxr_generate_song(audio_ctx, music_dark_meat_beat, (buffer) => {
    audio_music = buffer
    callback()
  })
  sonantxr_generate_sound(audio_ctx, sound_shoot, 140, (b) => { audio_sfx_shoot = b })
  sonantxr_generate_sound(audio_ctx, sound_hit, 134, (b) => { audio_sfx_hit = b })
  sonantxr_generate_sound(audio_ctx, sound_beep, 173, (b) => { audio_sfx_beep = b })
  sonantxr_generate_sound(audio_ctx, sound_hurt, 144, (b) => { audio_sfx_hurt = b })
  sonantxr_generate_sound(audio_ctx, sound_pickup, 156, (b) => { audio_sfx_pickup = b })
  sonantxr_generate_sound(audio_ctx, sound_terminal, 156, (b) => { audio_sfx_terminal = b })
  sonantxr_generate_sound(audio_ctx, sound_explode, 114, (b) => { audio_sfx_explode = b })
}

// ユーザー操作起点で AudioContext を再開し、BGM を鳴らし始める。
// main.ts のゲーム開始クリック（ページ唯一の必須ジェスチャ）から呼ぶ。
// audio_init() のコールバックがそのクリックハンドラを張るので、ここに来る
// 時点で audio_music は必ず埋まっている
export function audio_unlock(): void {
  audio_unlocked = true
  audio_ctx.resume()
  audio_play(audio_music, true)
}

export function audio_play(buffer: AudioBuffer | undefined, loop = false): void {
  if (!audio_unlocked) { return }
  // このガードは AudioBuffer | undefined という型を満たすためのもの。
  // 効果音 7 つは sonantxr_generate_sound が同期的にコールバックを呼ぶため
  // audio_init が返る時点で埋まっており、実行時に undefined で呼ばれる経路はない。
  if (!buffer) { return }
  const source = audio_ctx.createBufferSource()
  source.buffer = buffer
  source.loop = loop
  source.connect(audio_gain)
  source.start()
}

export function audio_toggle(): void {
  audio_enabled = !audio_enabled
  audio_gain.gain.value = audio_enabled ? 1 : 0
  // イントロ／エンディング中は通知でテキスト表示チェーンを壊してしまうので出さない
  if (state.game_running) {
    terminal_show_notice(audio_enabled ? '音声: ON' : '音声: OFF')
  }
}
