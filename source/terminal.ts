import { audio_play, audio_sfx_terminal } from './audio'
import { terminal_el } from './dom'

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

// 通知を打ち終えてから隠すまでの余韻（ミリ秒）。terminal_show_notice() が
// 返す所要時間と実際の待ちがずれないよう、両方でこの定数を使う
const terminal_notice_tail = 2000

// 1 行あたりの待ち（ミリ秒）と `> ` プレフィックスの有無。表示チェーンごとに
// 決まる設定なので、モジュール変数ではなく引数でチェーンを引き回す。モジュール
// 変数にすると、ノイズ表示（早送り・プレフィックスなし）のチェーンを
// terminal_cancel() が途中で捨てたとき通常値へ戻す側が走らず、以後そのセッション
// のすべての通知が早送り・プレフィックスなしのまま表示される
type terminal_style_t = {
  line_wait: number
  print_ident: boolean
}

const terminal_style_normal: terminal_style_t = { line_wait: 100, print_ident: true }
const terminal_style_garbage: terminal_style_t = { line_wait: 16, print_ident: false }

let terminal_text_buffer: string[] = []
let terminal_timeout_id: ReturnType<typeof setTimeout> = 0
let terminal_hide_timeout: ReturnType<typeof setTimeout> = 0

terminal_text_garbage += terminal_text_garbage + terminal_text_garbage

function terminal_show(): void {
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

// 表示内容と terminal_text_buffer は常に対で戻す。片方だけ戻すと、消えた行が
// バッファに残ったまま次の terminal_write_line() で復活する
export function terminal_clear(): void {
  terminal_el.innerHTML = ''
  terminal_text_buffer = []
}

function terminal_prepare_text(text: string): string[] {
  return text.replace(/_/g, '\n'.repeat(10)).split('\n')
}

function terminal_write_text(lines: string[], style: terminal_style_t, callback?: () => void): void {
  const line = lines.shift()
  if (line === undefined) {
    callback?.()
    return
  }
  terminal_write_line(line, () => terminal_write_text(lines, style, callback), style)
}

// style を最後の引数にしているのは、外から呼ぶ側（main.ts の `起動中...`）が
// 通常の文体しか使わないため
export function terminal_write_line(
  line: string,
  callback?: () => void,
  style: terminal_style_t = terminal_style_normal,
): void {
  if (terminal_text_buffer.length > 20) {
    terminal_text_buffer.shift()
  }
  if (line) {
    audio_play(audio_sfx_terminal)
    terminal_text_buffer.push((style.print_ident ? terminal_text_ident : '') + line)
    terminal_el.innerHTML = '<div>' + terminal_text_buffer.join('&nbsp;</div><div>') + '<b>█</b></div>'
  }
  if (callback) {
    terminal_timeout_id = setTimeout(callback, style.line_wait)
  }
}

// 通知を表示し、表示が終わるまでにかかる秒数を返す。
//
// 完了コールバックは受け取らない。渡されたコールバックは terminal_timeout_id の
// 表示チェーンにしか載せられず、そのチェーンは別の場所からの
// terminal_show_notice()（音声トグル、予備の一本、非常口通過）が
// 冒頭の terminal_cancel() で丸ごと捨ててしまう。非常口の降下予約をここに
// 載せていたため、通過演出の約 5 秒のあいだに通知が 1 つ挟まるだけで降下が
// 消え、フロアが永久に詰んだ（レビュー Finding 1）。表示の完了に合わせて
// 何かしたい呼び出し側は、戻り値の秒数を使って自分の側で予約すること
// （game.ts の state.descend_timer が例）。
export function terminal_show_notice(notice: string): number {
  terminal_clear()

  terminal_cancel()
  terminal_show()

  const lines = terminal_prepare_text(notice)
  // terminal_write_text() は lines を shift() で消費するので、長さは渡す前に読む。
  // 1 行につき line_wait を 1 回、打ち終わりに余韻を 1 回待つ
  const duration = lines.length * terminal_style_normal.line_wait + terminal_notice_tail
  terminal_write_text(lines, terminal_style_normal, () => {
    terminal_timeout_id = setTimeout(terminal_hide, terminal_notice_tail)
  })
  return duration / 1000
}

export function terminal_run_intro(): void {
  terminal_text_buffer = []
  terminal_write_text(terminal_prepare_text(terminal_text_title), terminal_style_normal, () => {
    terminal_timeout_id = setTimeout(terminal_run_garbage, 4000)
  })
}

function terminal_run_garbage(): void {
  let t = terminal_text_garbage
  const length = terminal_text_garbage.length

  for (let i = 0; i < 64; i++) {
    const s = (Math.random() * length) | 0
    const e = (Math.random() * (length - s)) | 0
    t += terminal_text_garbage.substr(s, e) + '\n'
  }
  t += ' \n \n'
  terminal_write_text(terminal_prepare_text(t), terminal_style_garbage, () => {
    terminal_timeout_id = setTimeout(terminal_run_story, 1500)
  })
}

function terminal_run_story(): void {
  terminal_write_text(terminal_prepare_text(terminal_text_story), terminal_style_normal)
}
