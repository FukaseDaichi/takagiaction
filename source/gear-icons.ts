// 装備アイコン 30 枚のテーブル。開封ダイアログ（equip-screen.ts）と死亡画面の
// 装備確認パネル（death-screen.ts）の両方が読む唯一の出どころ。
//
// 画像は静的 import しか使えない。'../m/ui/gear-' + id + '.webp' のような
// 文字列連結は Vite が静的に検出できず、本番ビルドで 404 になる
// （docs/architecture.md）。だから 30 行を並べてテーブルに詰める。
//
// 添字は tier - 1（段は 1 始まり、配列は 0 始まり）。

import type { gear_slot_t } from './equipment'

import blade_01 from '../m/ui/gear-blade-01.webp'
import blade_02 from '../m/ui/gear-blade-02.webp'
import blade_03 from '../m/ui/gear-blade-03.webp'
import blade_04 from '../m/ui/gear-blade-04.webp'
import blade_05 from '../m/ui/gear-blade-05.webp'
import blade_06 from '../m/ui/gear-blade-06.webp'
import blade_07 from '../m/ui/gear-blade-07.webp'
import blade_08 from '../m/ui/gear-blade-08.webp'
import blade_09 from '../m/ui/gear-blade-09.webp'
import blade_10 from '../m/ui/gear-blade-10.webp'
import patch_01 from '../m/ui/gear-patch-01.webp'
import patch_02 from '../m/ui/gear-patch-02.webp'
import patch_03 from '../m/ui/gear-patch-03.webp'
import patch_04 from '../m/ui/gear-patch-04.webp'
import patch_05 from '../m/ui/gear-patch-05.webp'
import patch_06 from '../m/ui/gear-patch-06.webp'
import patch_07 from '../m/ui/gear-patch-07.webp'
import patch_08 from '../m/ui/gear-patch-08.webp'
import patch_09 from '../m/ui/gear-patch-09.webp'
import patch_10 from '../m/ui/gear-patch-10.webp'
import sole_01 from '../m/ui/gear-sole-01.webp'
import sole_02 from '../m/ui/gear-sole-02.webp'
import sole_03 from '../m/ui/gear-sole-03.webp'
import sole_04 from '../m/ui/gear-sole-04.webp'
import sole_05 from '../m/ui/gear-sole-05.webp'
import sole_06 from '../m/ui/gear-sole-06.webp'
import sole_07 from '../m/ui/gear-sole-07.webp'
import sole_08 from '../m/ui/gear-sole-08.webp'
import sole_09 from '../m/ui/gear-sole-09.webp'
import sole_10 from '../m/ui/gear-sole-10.webp'

export const gear_icons: Record<gear_slot_t, string[]> = {
  blade: [
    blade_01, blade_02, blade_03, blade_04, blade_05,
    blade_06, blade_07, blade_08, blade_09, blade_10,
  ],
  sole: [
    sole_01, sole_02, sole_03, sole_04, sole_05,
    sole_06, sole_07, sole_08, sole_09, sole_10,
  ],
  patch: [
    patch_01, patch_02, patch_03, patch_04, patch_05,
    patch_06, patch_07, patch_08, patch_09, patch_10,
  ],
}
