class_name PartsFallback
extends RefCounted
## Inline parts table if JSON missing (keeps headless tests self-contained).


static func data() -> Dictionary:
	return {
		"bases": {
			"watchtower": {"range": 3.2, "fire_interval": 1.0, "level_bias": "balanced"},
			"bunker": {"range": 2.8, "fire_interval": 0.7, "level_bias": "rof"},
			"sniper": {"range": 5.0, "fire_interval": 1.4, "level_bias": "range"},
			"trap": {
				"range": 2.0,
				"fire_interval": 1.2,
				"pulse_primary": true,
				"pulse_radius": 1.6,
				"level_bias": "pulse",
			},
			"commander": {
				"range": 3.0,
				"fire_interval": 1.15,
				"aura": true,
				"aura_radius": 2.5,
				"aura_damage_mult": 1.15,
				"aura_rof_mult": 1.15,
				"level_bias": "aura",
			},
		},
		"barrels": {
			"single": {"pattern": "projectile", "count": 1, "speed": 9.0},
			"twin": {"pattern": "projectile", "count": 1, "alternating": true, "rof_mult": 1.4},
			"scatter": {"pattern": "projectile", "count": 3, "spread_deg": 28.0, "damage_note": "split"},
			"radius": {"pattern": "pulse", "pulse_radius": 2.0, "rof_mult": 0.85},
			"long": {"pattern": "projectile", "range_mult": 1.45, "pierce": 1, "speed": 11.0, "air_capable": true},
		},
		"payloads": {
			"pellet": {"damage": 10, "damage_type": "kinetic", "speed": 10.0},
			"explosive": {
				"damage": 14,
				"damage_type": "kinetic",
				"aoe_radius": 1.4,
				"aoe_falloff": true,
				"speed": 7.0,
			},
			"pyro": {
				"damage": 8,
				"damage_type": "fire",
				"status": {"burn": {"duration": 4.0, "dps": 2.0, "every": 0.5}},
				"speed": 9.0,
			},
			"electric": {
				"damage": 9,
				"damage_type": "shock",
				"chain_jumps": 2,
				"chain_falloff": 0.65,
				"speed": 12.0,
			},
			"frost": {
				"damage": 7,
				"damage_type": "frost",
				"status": {"slow": {"duration": 2.5, "amount": 0.45}},
				"speed": 8.0,
			},
		},
	}
