import { audio_play, audio_sfx_terminal } from './audio'
import { canvas, terminal_el } from './dom'

const terminal_text_ident = '&gt; '

const terminal_text_title = '' +
  'TAKAGI ACTION\n' +
  '__ \n' +
  '原作: UNDERRUN\n' +
  'コンセプト・グラフィック・プログラム:\n' +
  'DOMINIC SZABLEWSKI // PHOBOSLAB.ORG\n' +
  '__ \n' +
  '音楽:\n' +
  'ANDREAS LÖSCH // NO-FATE.NET\n' +
  '___ \n' +
  'システムバージョン: 13.20.18\n' +
  'CPU: PL(R) Q-COATL 7240 @ 12.6 THZ\n' +
  'メモリ: 108086391056891900 バイト\n' +
  ' \n' +
  '接続中...'

let terminal_text_garbage =
  '´A1e{∏éI9·NQ≥ÀΩ¸94CîyîR›kÈ¡˙ßT-;ûÅf^˛,¬›A∫Sã€«ÕÕ' +
  '1f@çX8ÎRjßf•ò√ã0êÃcÄ]Î≤moDÇ’ñ‰\\ˇ≠n=(s7É;'

const terminal_text_story =
  '日時: 2718年9月13日 13:32\n' +
  '生体モニタリング 警告\n' +
  '解析中...\n' +
  '____\n \n' +
  'エラーコード: NIC-0000\n' +
  '状態: 血中ニコチン濃度 低下\n' +
  '詳細: 対象は重度の喫煙依存と診断済み\n' +
  '適用法令: 嗜好性燃焼物 全面禁止条例（2703年施行）\n' +
  '当該施設の公認喫煙所: 0 箇所\n' +
  ' \n' +
  '代替療法を照会中...\n' +
  '___' +
  '該当なし\n \n' +
  '離脱症状の抑制を試行中...\n' +
  '___' +
  '失敗\n' +
  '_ \n \n' +
  '地下区画に旧式の喫煙所が残存している可能性\n' +
  '警備ドローンは稼働中\n' +
  '_ \n' +
  '移動: WASD または矢印キー / 射撃: スペース\n' +
  '音声切替: M\n' +
  'クリックで自席の端末へ\n '

let terminal_text_buffer: string[] = []
let terminal_line_wait = 100
let terminal_print_ident = true
let terminal_timeout_id: ReturnType<typeof setTimeout> = 0
let terminal_hide_timeout: ReturnType<typeof setTimeout> = 0

terminal_text_garbage += terminal_text_garbage + terminal_text_garbage

export function terminal_show(): void {
  clearTimeout(terminal_hide_timeout)
  terminal_el.style.opacity = '1'
  terminal_el.style.display = 'block'
}

export function terminal_hide(): void {
  terminal_el.style.opacity = '0'
  terminal_hide_timeout = setTimeout(() => {
    terminal_el.style.display = 'none'
  }, 1000)
}

export function terminal_cancel(): void {
  clearTimeout(terminal_timeout_id)
}

function terminal_prepare_text(text: string): string[] {
  return text.replace(/_/g, '\n'.repeat(10)).split('\n')
}

function terminal_write_text(lines: string[], callback?: () => void): void {
  const line = lines.shift()
  if (line === undefined) {
    callback?.()
    return
  }
  terminal_write_line(line, () => terminal_write_text(lines, callback))
}

export function terminal_write_line(line: string, callback?: () => void): void {
  if (terminal_text_buffer.length > 20) {
    terminal_text_buffer.shift()
  }
  if (line) {
    audio_play(audio_sfx_terminal)
    terminal_text_buffer.push((terminal_print_ident ? terminal_text_ident : '') + line)
    terminal_el.innerHTML = '<div>' + terminal_text_buffer.join('&nbsp;</div><div>') + '<b>█</b></div>'
  }
  if (callback) {
    terminal_timeout_id = setTimeout(callback, terminal_line_wait)
  }
}

export function terminal_show_notice(notice: string, callback?: () => void): void {
  terminal_el.innerHTML = ''
  terminal_text_buffer = []

  terminal_cancel()
  terminal_show()
  terminal_write_text(terminal_prepare_text(notice), () => {
    terminal_timeout_id = setTimeout(() => {
      terminal_hide()
      callback?.()
    }, 2000)
  })
}

export function terminal_run_intro(): void {
  terminal_text_buffer = []
  terminal_write_text(terminal_prepare_text(terminal_text_title), () => {
    terminal_timeout_id = setTimeout(() => {
      terminal_run_garbage()
    }, 4000)
  })
}

function terminal_run_garbage(callback?: () => void): void {
  terminal_print_ident = false
  terminal_line_wait = 16

  let t = terminal_text_garbage
  const length = terminal_text_garbage.length

  for (let i = 0; i < 64; i++) {
    const s = (Math.random() * length) | 0
    const e = (Math.random() * (length - s)) | 0
    t += terminal_text_garbage.substr(s, e) + '\n'
  }
  t += ' \n \n'
  terminal_write_text(terminal_prepare_text(t), () => {
    terminal_timeout_id = setTimeout(() => {
      terminal_run_story(callback)
    }, 1500)
  })
}

function terminal_run_story(callback?: () => void): void {
  terminal_print_ident = true
  terminal_line_wait = 100
  terminal_write_text(terminal_prepare_text(terminal_text_story), callback)
}

// ラン終了時のリザルト。クリックで自席の端末（闇サイトメニュー）へ移る。
// game_running のリセットとミニマップ・HUD の非表示は game.ts の run_end が持つ。
export function terminal_show_result(
  depth: number,
  kills: number,
  yani: number,
  best_depth: number,
  on_continue: () => void,
): void {
  canvas.style.opacity = '0.3'
  terminal_el.innerHTML = ''
  terminal_text_buffer = []

  terminal_cancel()
  terminal_show()

  // クリックハンドラはテキストの表示チェーン（下の terminal_write_text）が
  // 終わるより先に登録する。表示完了後のコールバックで登録すると、その間に
  // 別の terminal_show_notice() が terminal_cancel() でチェーンを壊した場合、
  // ハンドラが永久に登録されずクリックしても復帰できないままソフトロックする。
  // canvas の不透明度はここでは戻さない（続くメニューが暗いまま引き継ぐ）
  document.onclick = () => {
    document.onclick = null
    terminal_cancel()
    on_continue()
  }

  terminal_write_text(
    terminal_prepare_text(
      '生体反応 消失\n' +
      '救護ドローンが自席へ回収\n' +
      '_ \n' +
      '到達深度: ' + depth + '（自己ベスト: ' + best_depth + '）\n' +
      '撃破数: ' + kills + '\n' +
      '回収したヤニ: ' + yani + '\n' +
      '_ \n' +
      'クリックで端末へ\n ',
    ),
  )
}
