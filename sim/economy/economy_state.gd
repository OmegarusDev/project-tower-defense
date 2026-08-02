class_name EconomyState
extends RefCounted

var battle: int = 0
var forge: int = 0
var aether: int = 0
var start_battle_grant: int = 100
var wall_base_cost: int = 25
var wall_cost_step: int = 5


func setup_run_start() -> void:
	battle = start_battle_grant
	# forge/aether are meta — injected by app layer before run if needed


func inject_meta(p_forge: int, p_aether: int) -> void:
	forge = p_forge
	aether = p_aether


func wall_cost(walls_owned: int) -> int:
	return wall_base_cost + wall_cost_step * walls_owned


func spend_battle(amount: int) -> bool:
	if battle < amount:
		return false
	battle -= amount
	return true


func add_battle(amount: int) -> void:
	battle += amount


func add_forge(amount: int) -> void:
	forge += amount


func add_aether(amount: int) -> void:
	aether += amount


func on_wave_cleared(first_clear_level: bool = false) -> void:
	add_forge(5)
	add_aether(3)
	if first_clear_level:
		add_aether(15)


func on_campaign_beaten() -> void:
	add_forge(50)
