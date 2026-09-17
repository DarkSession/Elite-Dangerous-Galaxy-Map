// An extract of `MapData-UIA.js` of the Canonn Research Group's CanonnED3D-Map, cut to
// about 20 records. It holds the shape of the source and not its whole content: the
// category table, a few systems, a few entries of each of the four sphere lists, and the
// `routes` list, which is empty at the source because every entry in it is commented out.
//
// The file is JavaScript, as the source is, so the parser of the converter is read over
// the same comments, single quotes, unquoted keys and trailing commas the source holds.
var canonnEd3d_challenge = {
	//Define Categories
	systemsData: {
		categories: {
			"Points of Interest": {
				"1000": {
					'name': "Populated Systems",
					'color': 'FF9D00'
				},
				"1002": {
					'name': "Thargoid Systems",
					'color': '66FF66'
				},
				"1007": {
					'name': "Permit Locked Centers",
					'color': 'FF3333'
				},
				"1008": {
					'name': "Permit Unlocked Centers",
					'color': '393939'
				}
			},
			'Unidentified Interstellar Anomaly': {
				'100': {
					'name': 'Estimated Direction',
					'color': '004F4F',
				},
				'103': {
					'name': 'Lost Section',
					'color': '4F0000',
				},
				'101': {
					'name': 'Recorded Route',
					'color': '66FF66',
				},
				'102': {
					'name': 'Estimated Route',
					'color': '334400',
				},
			},/*
			"Measurements": {
				'1003': {
					'name': 'Measurement Lines',
					'color': '666666',
				},
			},*/
			"Hyperdictions": {
				"299": {
					name: "All Hyperdictions",
					color: "999900"
				},
				"300": {
					'name': "Hostile",
					'color': '660000'
				},
			},
		},
		systems: [
			{
				'name': "Sol",
				'infos': "Federation Home System.",
				'url': "",
				'coords': { x: 0, y: 0, z: 0 },
				'cat': ["1000"]
			},
			{
				'name': "Achenar",
				'infos': "Imperial Home System",
				'url': "",
				'coords': { x: 67.5, y: -119.46875, z: 24.84375 },
				'cat': ["1000"]
			},
			{
				'name': "HIP 22460",
				'infos': '<a href="https://canonn.science/codex/fort-asch/" target="_blank" rel="noopener">Fort Asch</a>',
				'url': "https://canonn.science/codex/fort-asch/",
				'coords': { x: -41.3125, y: -58.96875, z: -354.78125 },
				'cat': ["1002", "1000"]
			},
			{
				'name': "Merope",
				'infos': "",
				'url': "",
				'coords': { x: -78.59375, y: -149.625, z: -340.53125 },
				'cat': ["1002"]
			},
			{
				'name': "Hen 2-333",
				'infos': "",
				'url': "",
				'coords': { x: -840.65625, y: -561.15625, z: 13361.8125 },
				'cat': ["1007"]
			},/*
			{
				'name': "Oochorrs WX-F d12-10",
				'coords': { x: -44.59375, y: -35.09375, z: -1244.0625 },
				'cat': ["1005"]
			},*/
		],

		routes: [
			/*{
				cat: ["103"],
				circle: false,
				points: [
					{ 's': "Oochost BI-U c19-0", 'label': "Oochost BI-U c19-0" },
					{ 's': "Oochost CW-M b40-0", 'label': "Oochost CW-M b40-0" }
				]
			},*/
		],

		//permit UNlocked sectors
		puls: [
			{
				radius: 100.0,
				coords: [726.50391, -365.36328, -1377.93555],
				name: "Barnard's Loop Sector"
			},
			{
				radius: 426.0,
				coords: [1355.99609, -235.59766, -690.91602],
				name: "Col 132 Sector"
			},
			{
				radius: 100.0,
				coords: [369.41406, -401.57812, -715.72852],
				name: "Witch Head Sector"
			}
		],
		pls: [
			{
				radius: 514.0,
				coords: [508.68359, -372.59375, -1090.87891],
				name: "Col 70 Sector"
			},
			{
				radius: 510.0,
				coords: [851.16406, 83.68359, -2005.22070],
				name: "NGC 2264 Sector"
			},
			{ radius: 512.0, coords: [-43.0, 155.0, 37500.0], name: "Bleia1" },
			{ radius: 100.0, coords: [-24120.0, 10.0, -1220.0], name: "Sidgoir" },
		],
		hd_soi: [
			{
				radius: 150.0,
				coords: [-78.59375, -149.625, -340.53125],
				name: "Merope"
			},
			{
				radius: 50.0,
				coords: [-41.3125, -58.96875, -354.78125],
				name: "HIP 22460"
			}
		],
		g_soi: [
			{
				radius: 750.0,
				coords: [1099.21875, -146.68750, -133.59375],
				name: "Gamma Velorum"
			},

		]
	},
};
