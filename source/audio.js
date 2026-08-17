var audio_ctx = new (window.webkitAudioContext||window.AudioContext)(),
	audio_gain = audio_ctx.createGain(),
	// ローカル（localhost / 127.0.0.1 / file://）では既定でミュート
	audio_enabled = ['localhost', '127.0.0.1', ''].indexOf(location.hostname) === -1,
	audio_sfx_shoot,
	audio_sfx_hit,
	audio_sfx_hurt,
	audio_sfx_beep,
	audio_sfx_pickup,
	audio_sfx_terminal,
	audio_sfx_explode;

audio_gain.gain.value = audio_enabled ? 1 : 0;
audio_gain.connect(audio_ctx.destination);

function audio_init(callback) {
	sonantxr_generate_song(audio_ctx, music_dark_meat_beat, function(buffer){
		audio_play(buffer, true);
		callback();
	});
	sonantxr_generate_sound(audio_ctx, sound_shoot, 140, function(buffer){
		audio_sfx_shoot = buffer;
	});
	sonantxr_generate_sound(audio_ctx, sound_hit, 134, function(buffer){
		audio_sfx_hit = buffer;
	});
	sonantxr_generate_sound(audio_ctx, sound_beep, 173, function(buffer){
		audio_sfx_beep = buffer;
	});
	sonantxr_generate_sound(audio_ctx, sound_hurt, 144, function(buffer){
		audio_sfx_hurt = buffer;
	});
	sonantxr_generate_sound(audio_ctx, sound_pickup, 156, function(buffer){
		audio_sfx_pickup = buffer;
	});
	sonantxr_generate_sound(audio_ctx, sound_terminal, 156, function(buffer){
		audio_sfx_terminal = buffer;
	});
	sonantxr_generate_sound(audio_ctx, sound_explode, 114, function(buffer){
		audio_sfx_explode = buffer;
	});
};

function audio_play(buffer, loop) {
	var source = audio_ctx.createBufferSource();
	source.buffer = buffer;
	source.loop = loop;
	source.connect(audio_gain);
	source.start();
};

function audio_toggle() {
	audio_enabled = !audio_enabled;
	audio_gain.gain.value = audio_enabled ? 1 : 0;
	// イントロ／エンディング中は通知でテキスト表示チェーンを壊してしまうので出さない
	if (game_running) {
		terminal_show_notice(audio_enabled ? '音声: ON' : '音声: OFF');
	}
};