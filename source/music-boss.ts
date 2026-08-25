import type { SonantSong } from './sonantx-reduced'

// ボス階専用のBGM。music-dark-meat-beat.ts を土台に、テンポを上げて
// リバーブ／ディレイを詰め、頭から最も密なパターンで始まるように組み替えた
// もの。ボスのテーマは盛り上がりを待たせずに全開で始まる必要がある。
//
// 通常BGMとは別のバッファとして生成し、ボス階のロードで差し替える
// （audio.ts）。フェーズ 2 では playbackRate を上げて使い回す
export const music_boss: SonantSong = {
  rowLen: 4410,
  endPattern: 25,
  songData: [
    {
      osc1_oct: 7,
      osc1_det: 0,
      osc1_detune: 0,
      osc1_xenv: 0,
      osc1_vol: 255,
      osc1_waveform: 2,
      osc2_oct: 8,
      osc2_det: 0,
      osc2_detune: 18,
      osc2_xenv: 0,
      osc2_vol: 255,
      osc2_waveform: 3,
      noise_fader: 0,
      env_attack: 21074,
      env_sustain: 56363,
      env_release: 40000,
      env_master: 199,
      fx_filter: 2,
      fx_freq: 948,
      fx_resonance: 92,
      fx_delay_time: 7,
      fx_delay_amt: 30,
      fx_pan_freq: 3,
      fx_pan_amt: 100,
      lfo_osc1_freq: 0,
      lfo_fx_freq: 1,
      lfo_freq: 7,
      lfo_amt: 138,
      lfo_waveform: 3,
      p: [5,4,5,3,5,4,5,3,5,4,5,3,5,4,5,3,5,4,5,3,5,4,5,3],
      c: [
        {
          n: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        },
        {
          n: [122,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,121,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        },
        {
          n: [114,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        },
        {
          n: [119,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,121,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        },
        {
          n: [114,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,117,0,0,0,0,0,0,0]
        }
      ]
    },
    {
      osc1_oct: 7,
      osc1_det: 0,
      osc1_detune: 0,
      osc1_xenv: 0,
      osc1_vol: 192,
      osc1_waveform: 3,
      osc2_oct: 4,
      osc2_det: 0,
      osc2_detune: 0,
      osc2_xenv: 0,
      osc2_vol: 57,
      osc2_waveform: 0,
      noise_fader: 0,
      env_attack: 100,
      env_sustain: 150,
      env_release: 13636,
      env_master: 191,
      fx_filter: 2,
      fx_freq: 5839,
      fx_resonance: 254,
      fx_delay_time: 4,
      fx_delay_amt: 121,
      fx_pan_freq: 6,
      fx_pan_amt: 147,
      lfo_osc1_freq: 0,
      lfo_fx_freq: 0,
      lfo_freq: 6,
      lfo_amt: 195,
      lfo_waveform: 0,
      // 左回転 0（既に index 0 がパターン 2 = 唯一の非無音パターン）: 変更なし
      p: [2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,2],
      c: [
        {
          n: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        },
        {
          n: [131,0,131,0,131,0,0,0,133,0,134,0,134,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        }
      ]
    },
    {
      osc1_oct: 7,
      osc1_det: 2,
      osc1_detune: 0,
      osc1_xenv: 1,
      osc1_vol: 196,
      osc1_waveform: 0,
      osc2_oct: 7,
      osc2_det: 0,
      osc2_detune: 0,
      osc2_xenv: 1,
      osc2_vol: 255,
      osc2_waveform: 0,
      noise_fader: 0,
      env_attack: 100,
      env_sustain: 0,
      env_release: 3636,
      env_master: 254,
      fx_filter: 2,
      fx_freq: 612,
      fx_resonance: 254,
      fx_delay_time: 6,
      fx_delay_amt: 27,
      fx_pan_freq: 0,
      fx_pan_amt: 0,
      lfo_osc1_freq: 0,
      lfo_fx_freq: 0,
      lfo_freq: 0,
      lfo_amt: 0,
      lfo_waveform: 0,
      // 左回転 0（全要素がパターン 1）: 変更なし
      p: [1,1,1,1,1,1,1,1,1,1,1,1],
      c: [
        {
          n: [140,0,0,0,0,0,0,0,140,0,0,0,0,0,0,0,140,0,0,0,0,0,0,0,140,0,0,0,0,0,0,0]
        }
      ]
    },
    {
      osc1_oct: 7,
      osc1_det: 0,
      osc1_detune: 0,
      osc1_xenv: 0,
      osc1_vol: 77,
      osc1_waveform: 1,
      osc2_oct: 2,
      osc2_det: 0,
      osc2_detune: 188,
      osc2_xenv: 0,
      osc2_vol: 7,
      osc2_waveform: 0,
      noise_fader: 21,
      env_attack: 53732,
      env_sustain: 0,
      env_release: 14545,
      env_master: 13,
      fx_filter: 0,
      fx_freq: 0,
      fx_resonance: 240,
      fx_delay_time: 2,
      fx_delay_amt: 222,
      fx_pan_freq: 3,
      fx_pan_amt: 47,
      lfo_osc1_freq: 0,
      lfo_fx_freq: 0,
      lfo_freq: 0,
      lfo_amt: 0,
      lfo_waveform: 0,
      // 左回転 4（パターン 2/3 が非ゼロ個数 6 で同数のため、先頭 4 個の無音を
      // 落とす最小の左回転で機械的に確定。index 0 に来るのはパターン 2）
      p: [2,4,2,3,2,4,2,3,2,4,2,3,2,4,2,3,2,4,2,3,0,0,0,0],
      c: [
        {
          n: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        },
        {
          n: [131,0,131,0,131,0,0,0,133,0,134,0,134,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        },
        {
          n: [131,0,131,0,131,0,0,0,136,0,134,0,133,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        },
        {
          n: [131,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        }
      ]
    },
    {
      osc1_oct: 5,
      osc1_det: 0,
      osc1_detune: 0,
      osc1_xenv: 1,
      osc1_vol: 20,
      osc1_waveform: 0,
      osc2_oct: 7,
      osc2_det: 0,
      osc2_detune: 0,
      osc2_xenv: 1,
      osc2_vol: 7,
      osc2_waveform: 0,
      noise_fader: 178,
      env_attack: 0,
      env_sustain: 6338,
      env_release: 15454,
      env_master: 100,
      fx_filter: 3,
      fx_freq: 4352,
      fx_resonance: 240,
      fx_delay_time: 4,
      fx_delay_amt: 99,
      fx_pan_freq: 0,
      fx_pan_amt: 20,
      lfo_osc1_freq: 0,
      lfo_fx_freq: 1,
      lfo_freq: 7,
      lfo_amt: 64,
      lfo_waveform: 0,
      // 左回転 4（先頭の無音 4 個を落とす）
      p: [1,1,1,1,1,1,1,1,0,0,0,0],
      c: [
        {
          n: [0,0,0,0,0,0,0,0,137,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,137,0,0,0,0,0,0,0]
        }
      ]
    },
    {
      osc1_oct: 8,
      osc1_det: 0,
      osc1_detune: 0,
      osc1_xenv: 1,
      osc1_vol: 82,
      osc1_waveform: 2,
      osc2_oct: 8,
      osc2_det: 0,
      osc2_detune: 0,
      osc2_xenv: 0,
      osc2_vol: 0,
      osc2_waveform: 0,
      noise_fader: 125,
      env_attack: 100,
      env_sustain: 0,
      env_release: 9090,
      env_master: 232,
      fx_filter: 3,
      fx_freq: 5200,
      fx_resonance: 63,
      fx_delay_time: 4,
      fx_delay_amt: 131,
      fx_pan_freq: 0,
      fx_pan_amt: 0,
      lfo_osc1_freq: 0,
      lfo_fx_freq: 0,
      lfo_freq: 0,
      lfo_amt: 0,
      lfo_waveform: 0,
      // 左回転 12（先頭の無音 12 個を落とす）
      p: [1,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0],
      c: [
        {
          n: [141,141,141,141,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        }
      ]
    },
  ],
  songLen: 101,
}
