
var terminal_text_ident = '&gt; ';
var terminal_text_title = '' +
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
	'接続中...';

var terminal_text_garbage = 
	'´A1e{∏éI9·NQ≥ÀΩ¸94CîyîR›kÈ¡˙ßT-;ûÅf^˛,¬›A∫Sã€«ÕÕ' +
	'1f@çX8ÎRjßf•ò√ã0êÃcÄ]Î≤moDÇ’ñ‰\\ˇ≠n=(s7É;';

var terminal_text_story =
	'日時: 2718年9月13日 13:32\n' +
	'重大なソフトウェア障害を検出\n' +
	'解析中...\n' +
	'____\n \n' +
	'エラーコード: JS13K2018\n' +
	'状態: システム停止\n' +
	'詳細: 通信衛星の急速な非計画的分解によるバッファアンダーラン\n' +
	'影響システム: 施設オートメーション\n' +
	'影響サブシステム: AI、放射線シールド、電源管理\n' +
	' \n' +
	'救援システムを起動中...\n' +
	'___' +
	'失敗\n \n' +
	'自動再起動を試行中...\n' +
	'___' +
	'失敗\n' +
	'_ \n \n' +
	'全システムの手動再起動が必要\n' +
	'_ \n' +
	'移動: WASD または矢印キー / 射撃: マウス\n' +
	'クリックで現地へ展開開始\n ';

var terminal_text_outro =
	'全衛星リンク オンライン\n' +
	'接続中...___' +
	'接続を確立\n' +
	'通信を受信中...___ \n' +

	'送信: 2018年9月13日\n' +
	'受信: 2718年9月13日\n \n' +

	'プレイしてくれてありがとう ❤_ \n' +
	'私は 2012 年の第 1 回から JS13K コンペティションの\n' +
	'スポンサーを続けてきました。でも今年の大会は\n' +
	'参加者としては初めてで、最高に楽しかった！\n \n' +

	'無茶な短納期で素晴らしい音楽を書いてくれた親友、\n' +
	'NO-FATE.NET の ANDREAS LÖSCH に感謝します。\n \n' +

	'さらに JS13K のスタッフ、SONANT-X の開発者、\n' +
	'そして今年の JS13K の参加者全員に感謝を。\n' +
	'また来年！\n \n' +
	'DOMINIC__' +
	'通信終了';

var terminal_text_buffer = [],
	terminal_state = 0,
	terminal_current_line,
	terminal_line_wait = 100,
	terminal_print_ident = true,
	terminal_timeout_id = 0,
	terminal_hide_timeout = 0;

terminal_text_garbage += terminal_text_garbage + terminal_text_garbage;

function terminal_show() {
	clearTimeout(terminal_hide_timeout);
	a.style.opacity = 1;
	a.style.display = 'block';
}

function terminal_hide() {
	a.style.opacity = 0;
	terminal_hide_timeout = setTimeout(function(){a.style.display = 'none'}, 1000);
}

function terminal_cancel() {
	clearTimeout(terminal_timeout_id);
}

function terminal_prepare_text(text) {
	return text.replace(/_/g, '\n'.repeat(10)).split('\n');
}

function terminal_write_text(lines, callback) {
	if (lines.length) {
		terminal_write_line(lines.shift(), terminal_write_text.bind(this, lines, callback));
	}
	else {
		callback && callback();
	}
}

function terminal_write_line(line, callback) {
	if (terminal_text_buffer.length > 20) {
		terminal_text_buffer.shift();
	}
	if (line) {
		audio_play(audio_sfx_terminal);
		terminal_text_buffer.push((terminal_print_ident ? terminal_text_ident : '') + line);
		a.innerHTML = '<div>'+terminal_text_buffer.join('&nbsp;</div><div>')+'<b>█</b></div>';
	}
	terminal_timeout_id = setTimeout(callback, terminal_line_wait);
}

function terminal_show_notice(notice, callback) {
	a.innerHTML = '';
	terminal_text_buffer = [];

	terminal_cancel();
	terminal_show();
	terminal_write_text(terminal_prepare_text(notice), function(){
		terminal_timeout_id = setTimeout(function(){
			terminal_hide();
			callback && callback();
		}, 2000);
	});
}

function terminal_run_intro(callback) {
	terminal_text_buffer = [];
	terminal_write_text(terminal_prepare_text(terminal_text_title), function(){
		terminal_timeout_id = setTimeout(function(){
			terminal_run_garbage(callback);
		}, 4000);
	});
}

function terminal_run_garbage(callback) {
	terminal_print_ident = false;
	terminal_line_wait = 16;

	var t = terminal_text_garbage,
		length = terminal_text_garbage.length;

	for (var i = 0; i < 64; i++) {
		var s = (_math.random()*length)|0;
		var e = (_math.random()*(length - s))|0;
		t += terminal_text_garbage.substr(s, e) + '\n';
	}
	t += ' \n \n';
	terminal_write_text(terminal_prepare_text(t), function(){
		terminal_timeout_id = setTimeout(function(){
			terminal_run_story(callback);
		}, 1500);
	});
}

function terminal_run_story(callback) {
	terminal_print_ident = true;
	terminal_line_wait = 100;
	terminal_write_text(terminal_prepare_text(terminal_text_story), callback);
}

function terminal_run_outro(callback) {
	c.style.opacity = 0.3;
	a.innerHTML = '';
	terminal_text_buffer = [];

	terminal_cancel();
	terminal_show();
	terminal_write_text(terminal_prepare_text(terminal_text_outro));
}
