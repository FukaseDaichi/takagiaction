// source/sonantx-reduced.js（サードパーティ、zlib）の型宣言。
// 実装は .js 側にあり、TS はこの .d.ts のみを参照する。

export interface SonantInstrument {
  osc1_oct: number
  osc1_det: number
  osc1_detune: number
  osc1_xenv: number
  osc1_vol: number
  osc1_waveform: number
  osc2_oct: number
  osc2_det: number
  osc2_detune: number
  osc2_xenv: number
  osc2_vol: number
  osc2_waveform: number
  noise_fader: number
  env_attack: number
  env_sustain: number
  env_release: number
  env_master: number
  fx_filter: number
  fx_freq: number
  fx_resonance: number
  fx_delay_time: number
  fx_delay_amt: number
  fx_pan_freq: number
  fx_pan_amt: number
  lfo_osc1_freq: number
  lfo_fx_freq: number
  lfo_freq: number
  lfo_amt: number
  lfo_waveform: number
}

// 楽曲のトラックは音色にパターン列 p と、ノート列を持つカラム c が付いたもの
export interface SonantTrack extends SonantInstrument {
  p: number[]
  c: Array<{ n: number[] }>
}

export interface SonantSong {
  rowLen: number
  endPattern: number
  songData: SonantTrack[]
  songLen: number
}

export function sonantxr_generate_song(
  audio_ctx: AudioContext,
  song_data: SonantSong,
  callback: (buffer: AudioBuffer) => void,
): void

export function sonantxr_generate_sound(
  audio_ctx: AudioContext,
  instrument: SonantInstrument,
  note: number,
  callback: (buffer: AudioBuffer) => void,
): void
