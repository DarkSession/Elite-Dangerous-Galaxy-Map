// An extract of `MapData-Adamastor.js` of the Canonn Research Group's CanonnED3D-Map, cut
// to about 20 records. It holds the shape of the source: the grouped category table, a few
// systems, and the routes that read the rules the converter holds — a route the source's
// own systems resolve, a route whose category the table does not hold, a route with a
// waypoint placeholder that resolves nowhere, and a route that falls under two points.
var canonnEd3d_challenge = {
	//Define Categories
	systemsData: {
		categories: {
			'ACT I: Adamastor': {
				/*'10': {
					name: 'Varati',
					color: 'f5a142',
				},*/
				'101': {
					name: 'Adamastor Initial Route',
					color: 'FF6666',
				},
				'104': {
					name: 'Line Through Waypoints ',
					color: '666666',
				},
			},
			'ACT III: Project Seraph': {
				'301': {
					name: "Hyford's Cache & D-2's LPs",
					color: 'FF6666',
				},
				'302': {
					name: 'Project Seraph Settlements',
					color: '6666FF',
				},
			},
		},
		systems: [
			{
				'name': "HIP 22460",
				'infos': '<a href="https://canonn.science/codex/fort-asch/" target="_blank" rel="noopener">Fort Asch</a>',
				'url': "https://canonn.science/codex/fort-asch/",
				'coords': { x: -41.3125, y: -58.96875, z: -354.78125 },
				'cat': ["302"]
			},
			{
				'name': "HIP 26176",
				'infos': '',
				'url': "",
				'coords': { x: 394.4375, y: -323.53125, z: -1431.84375 },
				'cat': ["302", "301"]
			},
			{
				'name': "Wregoe DK-R b4-1",
				'infos': '',
				'url': "",
				'coords': { x: 171.65625, y: 7.5625, z: -951.1875 },
				'cat': ["301"]
			},
			{
				'name': "Colonia",
				'infos': '',
				'url': "",
				'coords': { x: -9530.5, y: -910.28125, z: 19808.125 },
				'cat': ["301"]
			},
		],
		"routes": [
			{
				cat: ["101"], 'points': [
					{ 's': 'HIP 33386', 'label': 'HIP 33386' },
					{ 's': 'HIP 39748', 'label': 'HIP 39748' },
					{ 's': 'Chukchan', 'label': 'Chukchan' },
				], 'circle': false
			},
			{
				cat: ["104"], 'points': [
					{ 's': 'Extention1', 'label': 'Extention1' },
					{ 's': 'HIP 33386', 'label': 'HIP 33386' },
					{ 's': 'HIP 39748', 'label': 'HIP 39748' },
					{ 's': 'Extention2', 'label': 'Extention2' },
				], 'circle': false
			},
			{
				cat: ["50"], 'points': [
					{ 's': 'HIP 39748', 'label': 'HIP 39748' },
					{ 's': 'Chukchan', 'label': 'Chukchan' },
				], 'circle': false
			},
			{
				cat: ["103"], 'points': [
					{ 's': 'Route Intersection', 'label': 'Route Intersection' },
					{ 's': 'Nowhere At All', 'label': 'Nowhere At All' },
					{ 's': 'Chukchan', 'label': 'Chukchan' },
				], 'circle': false
			},
			{
				cat: ["301"], 'points': [
					{ 's': 'HIP 26176', 'label': 'HIP 26176' },
					{ 's': 'wregoe dk-r b4-1', 'label': 'Wregoe DK-R b4-1' },
					{ 's': 'HIP 22460', 'label': 'HIP 22460' },
				], 'circle': false
			},
		]
	},
};
