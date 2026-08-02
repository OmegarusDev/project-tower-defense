class_name RosterBuilder
extends RefCounted
## Meta roster helpers — free starter triad, place-cost sum.

const STARTER_BASE := "watchtower"
const STARTER_BARREL := "single"
const STARTER_PAYLOAD := "pellet"

const PART_COSTS := {
	"watchtower": 20, "bunker": 30, "sniper": 35, "trap": 40, "commander": 45,
	"single": 10, "twin": 20, "scatter": 25, "radius": 30, "long": 28,
	"pellet": 5, "explosive": 20, "pyro": 22, "electric": 24, "frost": 18,
}


static func default_owned() -> Dictionary:
	return {
		"bases": [STARTER_BASE],
		"barrels": [STARTER_BARREL],
		"payloads": [STARTER_PAYLOAD],
	}


static func default_slots(slot_count: int = 3, level_cap: int = 1) -> Array[Dictionary]:
	var slots: Array[Dictionary] = []
	for i in slot_count:
		if i == 0:
			slots.append(make_slot(STARTER_BASE, STARTER_BARREL, STARTER_PAYLOAD, level_cap))
		else:
			slots.append(make_slot("", "", "", level_cap))
	return slots


static func make_slot(base_id: String, barrel_id: String, payload_id: String, level_cap: int = 1) -> Dictionary:
	var complete := base_id != "" and barrel_id != "" and payload_id != ""
	var cost := 0
	if complete:
		cost = int(PART_COSTS.get(base_id, 20)) + int(PART_COSTS.get(barrel_id, 10)) + int(PART_COSTS.get(payload_id, 5))
	return {
		"base": base_id,
		"barrel": barrel_id,
		"payload": payload_id,
		"complete": complete,
		"place_cost": cost,
		"level_cap": level_cap,
	}
