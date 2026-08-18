
// Fog of war minimap, drawn on a 2d canvas overlaying the WebGL view.
// One level tile == one pixel, so the whole 64x64 level fits as-is.

var
	minimap_view_radius = 10, // tiles revealed around the player
	minimap_explored = new Uint8Array(level_width * level_height),
	minimap_ctx = m.getContext('2d'),
	minimap_pixels = minimap_ctx.createImageData(level_width, level_height);

function minimap_reset() {
	minimap_explored.fill(0);
	m.style.display = 'block';
}

function minimap_hide() {
	m.style.display = 'none';
}

function minimap_update() {
	minimap_reveal();
	minimap_draw();
}

function minimap_set_pixel(index, r, g, b) {
	var p = index * 4;
	minimap_pixels.data[p] = r;
	minimap_pixels.data[p+1] = g;
	minimap_pixels.data[p+2] = b;
	minimap_pixels.data[p+3] = 255;
}

// Walk a line of tiles from the player towards a target tile, revealing what
// is visible and stopping at whatever blocks the view.
function minimap_cast(x0, z0, x1, z1) {
	var steps = _math.max(_math.abs(x1 - x0), _math.abs(z1 - z0)) || 1,
		step_x = (x1 - x0) / steps,
		step_z = (z1 - z0) / steps;

	for (var i = 0, x = x0, z = z0; i <= steps; i++, x += step_x, z += step_z) {
		var tile_x = _math.round(x),
			tile_z = _math.round(z);

		if (tile_x < 0 || tile_x >= level_width || tile_z < 0 || tile_z >= level_height) {
			return;
		}

		var index = tile_x + tile_z * level_width,
			tile = level_data[index];

		if (tile === 0) { return; } // void: nothing to see and blocks the view
		minimap_explored[index] = 1;
		if (tile > 7) { return; } // wall: visible, but blocks the view
	}
}

function minimap_reveal() {
	var center_x = entity_player.x >> 3,
		center_z = entity_player.z >> 3,
		r = minimap_view_radius;

	for (var dz = -r; dz <= r; dz++) {
		for (var dx = -r; dx <= r; dx++) {
			if (dx * dx + dz * dz <= r * r) {
				minimap_cast(center_x, center_z, center_x + dx, center_z + dz);
			}
		}
	}
}

function minimap_draw() {

	// terrain - unexplored tiles stay transparent, showing the canvas background
	for (var index = 0; index < level_data.length; index++) {
		if (!minimap_explored[index]) {
			minimap_pixels.data[index * 4 + 3] = 0;
		}
		else if (level_data[index] > 7) {
			minimap_set_pixel(index, 90, 110, 125); // wall
		}
		else {
			minimap_set_pixel(index, 28, 58, 74); // floor
		}
	}

	// cpus in explored areas - bright while offline, dimmed once rebooted
	for (var i = 0; i < entities.length; i++) {
		var cpu = entities[i];
		if (cpu instanceof(entity_cpu_t)) {
			var cpu_index = (cpu.x >> 3) + (cpu.z >> 3) * level_width;
			if (minimap_explored[cpu_index]) {
				cpu.h > 5
					? minimap_set_pixel(cpu_index, 40, 60, 100)
					: minimap_set_pixel(cpu_index, 80, 130, 255);
			}
		}
	}

	// player position, plus one pixel for the direction it faces
	var player_index = (entity_player.x >> 3) + (entity_player.z >> 3) * level_width;
	minimap_set_pixel(player_index, 255, 255, 255);
	minimap_set_pixel(
		player_index +
			_math.round(_math.cos(entity_player._angle)) +
			_math.round(_math.sin(entity_player._angle)) * level_width,
		238, 153, 0
	);

	minimap_ctx.putImageData(minimap_pixels, 0, 0);
}
