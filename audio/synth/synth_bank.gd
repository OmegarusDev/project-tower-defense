class_name SynthBank
extends Node
## Bakes short PCM SFX at boot — no external WAV packs. Runtime = play + bus volumes.

const MIX_RATE := 22050
const BUS_SFX := "SFX"
const BUS_UI := "UI"

var _players: Dictionary = {} # name -> AudioStreamPlayer
var _streams: Dictionary = {} # name -> AudioStreamWAV


func bake_all() -> void:
	_streams["ui_click"] = _bake_tone(880.0, 0.04, 0.25, "square")
	_streams["ui_confirm"] = _bake_tone(660.0, 0.06, 0.3, "triangle")
	_streams["place"] = _bake_noise_blip(0.08, 0.35)
	_streams["sell"] = _bake_tone(220.0, 0.1, 0.3, "saw")
	_streams["shot"] = _bake_tone(520.0, 0.05, 0.2, "square")
	_streams["hit"] = _bake_tone(180.0, 0.04, 0.35, "noise")
	_streams["explode"] = _bake_noise_blip(0.18, 0.5)
	_streams["pulse"] = _bake_tone(140.0, 0.12, 0.4, "sine")
	_streams["wave"] = _bake_tone(330.0, 0.15, 0.25, "triangle")
	for key in _streams.keys():
		var p := AudioStreamPlayer.new()
		p.name = "SFX_%s" % key
		p.stream = _streams[key]
		p.bus = BUS_UI if key.begins_with("ui_") else BUS_SFX
		add_child(p)
		_players[key] = p


func play(name_id: String, pitch_scale: float = 1.0) -> void:
	if not _players.has(name_id):
		return
	var p: AudioStreamPlayer = _players[name_id]
	p.pitch_scale = pitch_scale
	p.play()


func _bake_tone(freq: float, seconds: float, volume: float, shape: String) -> AudioStreamWAV:
	var frames := int(MIX_RATE * seconds)
	var data := PackedByteArray()
	data.resize(frames * 2)
	for i in frames:
		var t := float(i) / float(MIX_RATE)
		var env := 1.0 - (float(i) / float(frames))
		env *= env
		var phase := t * freq
		var sample := 0.0
		match shape:
			"square":
				sample = 1.0 if fmod(phase, 1.0) < 0.5 else -1.0
			"triangle":
				var p := fmod(phase, 1.0)
				sample = 4.0 * absf(p - 0.5) - 1.0
			"saw":
				sample = 2.0 * fmod(phase, 1.0) - 1.0
			"noise":
				sample = randf() * 2.0 - 1.0
			_:
				sample = sin(phase * TAU)
		var s := int(clampf(sample * volume * env * 32767.0, -32768, 32767))
		data[i * 2] = s & 0xFF
		data[i * 2 + 1] = (s >> 8) & 0xFF
	return _wav_from_pcm16(data)


func _bake_noise_blip(seconds: float, volume: float) -> AudioStreamWAV:
	return _bake_tone(0.0, seconds, volume, "noise")


func _wav_from_pcm16(pcm: PackedByteArray) -> AudioStreamWAV:
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = MIX_RATE
	stream.stereo = false
	stream.data = pcm
	return stream
