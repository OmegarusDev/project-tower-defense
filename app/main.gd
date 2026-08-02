extends Node
## App entry: boots procedural pipelines, then hands off to the screen state machine.

const SIM_HZ := 60.0

@onready var _boot: Node = $Boot if has_node("Boot") else null

var palette: ProcPalette
var bake_cache: BakeCache
var synth_bank: SynthBank
var score_engine: ScoreEngine
var screens: ScreenStateMachine


func _ready() -> void:
	_ensure_children()
	palette = ProcPalette.new()
	palette.build_default()
	bake_cache = BakeCache.new()
	bake_cache.setup(palette)
	synth_bank = SynthBank.new()
	synth_bank.bake_all()
	add_child(synth_bank)
	score_engine = ScoreEngine.new()
	score_engine.setup(SIM_HZ)
	add_child(score_engine)
	screens = ScreenStateMachine.new()
	screens.name = "Screens"
	screens.setup(self)
	add_child(screens)
	screens.go_to(ScreenStateMachine.Screen.MAIN_MENU)
	score_engine.start_ambient()


func _ensure_children() -> void:
	# Scene may be script-only; keep resilient.
	pass


func _process(delta: float) -> void:
	if score_engine:
		score_engine.tick(delta)
