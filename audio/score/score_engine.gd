class_name ScoreEngine
extends Node
## Lightweight generative score: ambient pad + kick scheduler on sim clock (not wall clock).

const MIX_RATE := 22050
const BUS_MUSIC := "Music"

var sim_hz: float = 60.0
var sim_speed: float = 1.0
var wave_index: int = 1
var running: bool = false

var _kick_player: AudioStreamPlayer
var _pad_player: AudioStreamPlayer
var _kick_stream: AudioStreamWAV
var _pad_stream: AudioStreamWAV
var _accum: float = 0.0
var _beat_period: float = 0.5


func setup(p_sim_hz: float) -> void:
	sim_hz = p_sim_hz
	_kick_stream = _bake_kick()
	_pad_stream = _bake_pad()
	_kick_player = AudioStreamPlayer.new()
	_kick_player.stream = _kick_stream
	_kick_player.bus = BUS_MUSIC
	add_child(_kick_player)
	_pad_player = AudioStreamPlayer.new()
	_pad_player.stream = _pad_stream
	_pad_player.bus = BUS_MUSIC
	_pad_player.volume_db = -8.0
	add_child(_pad_player)


func start_ambient() -> void:
	running = true
	if not _pad_player.playing:
		_pad_player.play()
	_update_tempo()


func stop() -> void:
	running = false
	_pad_player.stop()
	_kick_player.stop()


func set_wave(wave: int) -> void:
	wave_index = maxi(1, wave)
	_update_tempo()


func set_sim_speed(mult: float) -> void:
	sim_speed = maxf(0.1, mult)
	_update_tempo()


func tick(delta: float) -> void:
	if not running:
		return
	# Kick follows sim clock so 2x/3x intensifies with gameplay.
	_accum += delta * sim_speed
	if _accum >= _beat_period:
		_accum = fmod(_accum, _beat_period)
		_kick_player.play()


func _update_tempo() -> void:
	# Base 120 BPM-ish; rises each endless wave.
	var bpm := 96.0 + float(wave_index - 1) * 2.5
	bpm = minf(bpm, 168.0)
	_beat_period = 60.0 / bpm


func _bake_kick() -> AudioStreamWAV:
	var seconds := 0.12
	var frames := int(MIX_RATE * seconds)
	var data := PackedByteArray()
	data.resize(frames * 2)
	for i in frames:
		var t := float(i) / float(MIX_RATE)
		var env := exp(-t * 28.0)
		var freq := lerpf(120.0, 40.0, clampf(t / seconds, 0.0, 1.0))
		var sample := sin(t * freq * TAU) * env
		var s := int(clampf(sample * 0.85 * 32767.0, -32768, 32767))
		data[i * 2] = s & 0xFF
		data[i * 2 + 1] = (s >> 8) & 0xFF
	return _wav(data)


func _bake_pad() -> AudioStreamWAV:
	# Short seamless-ish loop: two detuned sines.
	var seconds := 2.0
	var frames := int(MIX_RATE * seconds)
	var data := PackedByteArray()
	data.resize(frames * 2)
	for i in frames:
		var t := float(i) / float(MIX_RATE)
		var a := sin(t * 110.0 * TAU) * 0.2
		var b := sin(t * 164.5 * TAU) * 0.12
		var c := sin(t * 220.0 * TAU) * 0.08
		var sample := (a + b + c) * 0.7
		var s := int(clampf(sample * 32767.0, -32768, 32767))
		data[i * 2] = s & 0xFF
		data[i * 2 + 1] = (s >> 8) & 0xFF
	var stream := _wav(data)
	stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
	stream.loop_end = frames
	return stream


func _wav(pcm: PackedByteArray) -> AudioStreamWAV:
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = MIX_RATE
	stream.stereo = false
	stream.data = pcm
	return stream
