// An extract of `MapData-multifaction.js` of the Canonn Research Group's CanonnED3D-Map,
// cut to a few spheres. It holds the shape of the source and not its whole content: the
// colour pairs the four record categories come from, the empty `systemsData` literal, and
// the `permitSpheres` literal with three entries of `pls` and two of `puls`.
//
// The last two entries of `pls` are faults the reader drops: one carries a radius of 0 and
// one carries two coordinates. The source itself holds no such entry.
//
// The file is JavaScript, as the source is, so the parser of the converter is read over
// the same comments, single quotes, unquoted keys and trailing commas the source holds.

// Distinct colour pairs [controlled, present] per faction slot
const factionColorPairs = [
	['FF2400', 'FF9D80'], // Red / Salmon
	['1569C7', '7EC8E3'], // Blue / Sky
];

var canonnEd3d_multifaction = {

	systemsData: {
		categories: {},
		systems: [],
		routes: [],
	},

	// Permit-locked sphere data
	permitSpheres: {
		pls: [
			{ radius: 514.0, coords: [508.68359, -372.59375, -1090.87891], name: 'Col 70 Sector' },
			{ radius: 510.0, coords: [851.16406, 83.68359, -2005.22070],   name: 'NGC 2264 Sector' },
			{ radius: 100.0, coords: [-24120.0,   10.0,  -1220.0], name: 'Sidgoir' },
			{ radius: 0.0,   coords: [0.0, 0.0, 0.0], name: 'No Radius' },
			{ radius: 100.0, coords: [1.0, 2.0], name: 'No Third Coordinate' },
		],
		puls: [
			{ radius: 100.0, coords: [726.50391, -365.36328, -1377.93555],  name: "Barnard's Loop Sector" },
			{ radius: 426.0, coords: [1355.99609, -235.59766, -690.91602],  name: 'Col 132 Sector' },
		],
	},

	/*
	 * The source draws each list with a material of its own, in `finishMap`, and the
	 * converter takes the tint of that material as the colour of the category.
	 */
};
