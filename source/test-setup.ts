// Vitest の setupFiles。テストごとのワーカープロセスで、本体の import より先に走る。
//
// Node 22 以降の globalThis.localStorage は「--localstorage-file が無い」という
// ExperimentalWarning を出すゲッターで、読むだけで発火する。`typeof localStorage`
// もゲッターを呼ぶので、meta.ts 側にガードを足しても警告は消せない。
// プロパティごと外して「localStorage を持たないブラウザ」を再現する。参照は
// ReferenceError になり、meta.ts の try/catch がそのまま拾って persistent = false
// になる（ゲッターが undefined を返していた従来と同じ結果）。ブラウザでは
// このファイルを読まないので、保存・読み込みの挙動は一切変わらない
delete (globalThis as { localStorage?: unknown }).localStorage
