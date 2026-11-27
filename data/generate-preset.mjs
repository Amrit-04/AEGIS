#!/usr/bin/env node
/**
 * AEGIS preset-city generator.
 *
 * Downloads small OpenStreetMap extracts once, contracts degree-two road
 * nodes into intersection-to-intersection edges, and writes the compact JSON
 * files consumed by the app. The committed JSON is the artifact; this script
 * exists so the extracts can be reproduced and audited.
 *
 * Usage: npm run generate:preset
 * Requires network access on the first run.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const PRESETS = {
  seattle: {
    name: 'Seattle · First Hill',
    output: path.join(HERE, 'preset-city.json'),
    cache: path.join(HERE, '.cache', 'seattle.osm'),
    bbox: { south: 47.6, west: -122.338, north: 47.614, east: -122.318 },
    hospitals: [
      'Virginia Mason Hospital & Seattle Medical Center',
      'Swedish First Hill Medical Center',
    ],
    shelters: [
      'Seattle City Hall',
      'Town Hall Seattle',
      'Yesler Terrace Community Center',
      'The Northwest School',
    ],
    hospitalCapacity: {
      'Virginia Mason Hospital & Seattle Medical Center': 420,
      'Swedish First Hill Medical Center': 360,
    },
    shelterCapacity: {
      'The Seattle Public Library - Central Library': 850,
      'Seattle City Hall': 640,
      'Town Hall Seattle': 480,
      'Yesler Terrace Community Center': 720,
      'The Northwest School': 390,
    },
  },
  mumbai: {
    name: 'Mumbai · Fort',
    output: path.join(HERE, 'preset-city-mumbai.json'),
    cache: path.join(HERE, '.cache', 'mumbai.osm'),
    bbox: { south: 18.922, west: 72.825, north: 18.948, east: 72.842 },
    hospitals: [
      'Bombay Hospital',
      'St George Hospital',
      'Cama Hospital',
      'HCG Hospital',
    ],
    shelters: [
      'Brabourne Stadium',
      'Wankhede Stadium',
      'Cooperage Stadium',
      'Mumbai University - Fort Campus',
      "St.Xavier's College",
      'Sir J.J. School of Art, Architecture, and Applied Art',
      'Campion School',
      'J. B. Petit High School for Girls',
      'Jai Hind College',
      'K C College',
    ],
    hospitalCapacity: {
      'Bombay Hospital': 430,
      'St George Hospital': 340,
      'Cama Hospital': 300,
      'HCG Hospital': 290,
    },
    shelterCapacity: {
      'Brabourne Stadium': 880,
      'Wankhede Stadium': 1200,
      'Cooperage Stadium': 950,
      'Mumbai University - Fort Campus': 760,
      "St.Xavier's College": 650,
      'Sir J.J. School of Art, Architecture, and Applied Art': 540,
      'Campion School': 410,
      'J. B. Petit High School for Girls': 390,
      'Jai Hind College': 700,
      'K C College': 680,
    },
  },
};

const ROAD_CLASSES = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'unclassified', 'residential', 'living_street',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
]);

const DEFAULT_SPEED_KPH = {
  motorway: 95,
  trunk: 75,
  primary: 55,
  secondary: 45,
  tertiary: 40,
  unclassified: 35,
  residential: 30,
  living_street: 15,
  motorway_link: 45,
  trunk_link: 40,
  primary_link: 35,
  secondary_link: 30,
  tertiary_link: 30,
};

const LOCAL_M_PER_DEG_LAT = 111_132;
const LOCAL_M_PER_DEG_LON_BASE = 111_320;

const round = (value, digits = 1) => Number(value.toFixed(digits));

function decodeXml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function parseTags(body) {
  const tags = {};
  for (const match of body.matchAll(/<tag\s+k="([^"]+)"\s+v="([^"]+)"\s*\/>/g)) {
    tags[decodeXml(match[1])] = decodeXml(match[2]);
  }
  return tags;
}

function parseMaxspeed(tags) {
  const raw = tags.maxspeed;
  if (!raw) return undefined;
  const match = /^(\d+(?:\.\d+)?)/.exec(raw);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  if (/mph/i.test(raw)) return round(value * 1.609344, 0);
  return value;
}

function makeProjector(bbox) {
  const centerLat = (bbox.south + bbox.north) / 2;
  const centerLon = (bbox.west + bbox.east) / 2;
  const localMPerDegLon = LOCAL_M_PER_DEG_LON_BASE * Math.cos((centerLat * Math.PI) / 180);
  return (lat, lon) => ({
    x: round((lon - centerLon) * localMPerDegLon),
    y: round((centerLat - lat) * LOCAL_M_PER_DEG_LAT),
  });
}

function haversineMeters(a, b) {
  const radius = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

async function loadOsm(config) {
  if (existsSync(config.cache)) {
    return readFile(config.cache, 'utf8');
  }
  const { west, south, east, north } = config.bbox;
  const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${west},${south},${east},${north}`;
  console.log(`Downloading ${config.name}: ${url}`);
  const response = await fetch(url, {
    headers: { 'User-Agent': 'AEGIS-portfolio/1.0 (reproducible demo build)' },
  });
  if (!response.ok) throw new Error(`OSM API returned ${response.status}`);
  const text = await response.text();
  if (text.startsWith('You requested too many nodes')) {
    throw new Error('OSM extract is too large; shrink the bbox in generate-preset.mjs');
  }
  await mkdir(path.dirname(config.cache), { recursive: true });
  await writeFile(config.cache, text, 'utf8');
  return text;
}

function parseOsm(xml) {
  const nodes = new Map();
  for (const match of xml.matchAll(/<node\s+([^>]*?)\/?>/g)) {
    const attrs = match[1];
    const id = /id="(\d+)"/.exec(attrs)?.[1];
    const lat = Number(/lat="([^"]+)"/.exec(attrs)?.[1]);
    const lon = Number(/lon="([^"]+)"/.exec(attrs)?.[1]);
    if (id && Number.isFinite(lat) && Number.isFinite(lon)) {
      nodes.set(id, { id, lat, lon, tags: {} });
    }
  }

  const ways = [];
  const facilities = [];
  for (const match of xml.matchAll(/<way\s+([^>]*?)>([\s\S]*?)<\/way>/g)) {
    const body = match[2];
    const tags = parseTags(body);
    const refs = [...body.matchAll(/<nd\s+ref="(\d+)"\s*\/>/g)].map((m) => m[1]);
    if (refs.length < 2) continue;

    if (tags.highway && ROAD_CLASSES.has(tags.highway)) {
      ways.push({ refs, tags });
    }

    const name = tags.name || tags.name_en;
    const isHospital =
      name &&
      (tags.amenity === 'hospital' || tags.healthcare === 'hospital' || tags.building === 'hospital');
    const isShelter =
      name &&
      (tags.amenity === 'school' ||
        tags.amenity === 'community_centre' ||
        tags.amenity === 'townhall' ||
        tags.amenity === 'stadium' ||
        tags.amenity === 'college' ||
        tags.amenity === 'university' ||
        tags.leisure === 'stadium' ||
        tags.emergency === 'assembly_point');
    if (isHospital) facilities.push({ kind: 'hospital', name, refs });
    if (isShelter) facilities.push({ kind: 'shelter', name, refs });
  }

  return { nodes, ways, facilities };
}

function buildSegments(osm) {
  const segments = [];
  for (const way of osm.ways) {
    const highway = way.tags.highway;
    const speed = parseMaxspeed(way.tags) ?? DEFAULT_SPEED_KPH[highway] ?? 30;
    const oneway = way.tags.oneway === 'yes' || way.tags.oneway === '1' || way.tags.oneway === 'true'
      ? 1
      : way.tags.oneway === '-1'
        ? -1
        : 0;
    const signature = `${highway}|${speed}|${oneway}`;

    for (let i = 0; i < way.refs.length - 1; i += 1) {
      const a = osm.nodes.get(way.refs[i]);
      const b = osm.nodes.get(way.refs[i + 1]);
      if (!a || !b) continue;
      segments.push({
        a: a.id,
        b: b.id,
        aCoord: a,
        bCoord: b,
        length: haversineMeters(a, b),
        speed,
        road: highway,
        oneway,
        signature,
      });
    }
  }
  return segments;
}

function contractSegments(segments) {
  const incident = new Map();
  for (const segment of segments) {
    if (!incident.has(segment.a)) incident.set(segment.a, []);
    if (!incident.has(segment.b)) incident.set(segment.b, []);
    incident.get(segment.a).push(segment);
    incident.get(segment.b).push(segment);
  }
  incident.forEach((list) => list.sort((x, y) => x.b.localeCompare(y.b)));

  const degree = (id) => incident.get(id)?.length ?? 0;
  const isKept = new Set();
  for (const [id, list] of incident) {
    if (degree(id) !== 2) isKept.add(id);
    for (const segment of list) {
      if (segment.oneway !== 0) isKept.add(id);
    }
  }
  // Preserve attribute changes (e.g. a residential street becoming an arterial)
  // by keeping both endpoints of every non-uniform segment pair.
  for (const [id, list] of incident) {
    if (list.length !== 2) continue;
    if (list[0].signature !== list[1].signature) isKept.add(id);
  }

  const visited = new Set();
  const chains = [];
  for (const start of [...isKept].sort()) {
    for (const first of incident.get(start)) {
      if (visited.has(first)) continue;
      const ordered = [first];
      visited.add(first);
      let previous = start;
      let current = first.a === previous ? first.b : first.a;
      const seen = new Set([start, current]);

      while (!isKept.has(current)) {
        const next = incident.get(current)?.find((segment) => !visited.has(segment));
        if (!next) break;
        visited.add(next);
        ordered.push(next);
        const following = next.a === current ? next.b : next.a;
        previous = current;
        current = following;
        if (seen.has(current)) break;
        seen.add(current);
      }
      chains.push({ start, end: current, segments: ordered });
    }
  }

  // Any segments missed because both endpoints are degree-two but form a loop.
  for (const segment of segments) {
    if (!visited.has(segment)) {
      visited.add(segment);
      chains.push({ start: segment.a, end: segment.b, segments: [segment] });
    }
  }

  const directed = [];
  for (const chain of chains) {
    const totalLength = chain.segments.reduce((sum, s) => sum + s.length, 0);
    if (totalLength <= 0) continue;
    const first = chain.segments[0];
    const forward =
      chain.segments.every((segment) => segment.oneway === 0) ||
      (first.oneway === 1 && first.a === chain.start) ||
      (first.oneway === -1 && first.b === chain.start);
    const reverse =
      chain.segments.every((segment) => segment.oneway === 0) ||
      (first.oneway === 1 && first.b === chain.start) ||
      (first.oneway === -1 && first.a === chain.start);

    const base = {
      lengthM: round(totalLength),
      speedKph: first.speed,
      road: first.road,
    };
    if (forward) directed.push({ from: chain.start, to: chain.end, ...base });
    if (reverse) directed.push({ from: chain.end, to: chain.start, ...base });
  }
  return directed;
}

function centroidOf(refs, nodes) {
  let lat = 0;
  let lon = 0;
  let count = 0;
  for (const ref of refs) {
    const node = nodes.get(ref);
    if (!node) continue;
    lat += node.lat;
    lon += node.lon;
    count += 1;
  }
  return count ? { lat: lat / count, lon: lon / count } : undefined;
}

function selectFacilities(osm, keptNodes, config) {
  const byName = new Map();
  for (const facility of osm.facilities) {
    if (!byName.has(facility.name)) {
      const coord = centroidOf(facility.refs, osm.nodes);
      if (coord) byName.set(facility.name, { ...facility, coord });
    }
  }

  const findNearest = (coord) => {
    let bestId;
    let bestDistance = Infinity;
    for (const id of keptNodes) {
      const node = osm.nodes.get(id);
      if (!node) continue;
      const distance = haversineMeters(coord, node);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = id;
      }
    }
    return bestId;
  };

  const hospitals = [];
  for (const name of config.hospitals) {
    const facility = byName.get(name);
    if (!facility) {
      console.warn(`  missing hospital: ${name}`);
      continue;
    }
    const node = findNearest(facility.coord);
    if (!node) continue;
    hospitals.push({ name, node, capacity: config.hospitalCapacity[name] ?? 300 });
  }

  const shelters = [];
  for (const name of config.shelters) {
    const facility = byName.get(name);
    if (!facility) {
      console.warn(`  missing shelter: ${name}`);
      continue;
    }
    const node = findNearest(facility.coord);
    if (!node) continue;
    shelters.push({ name, node, capacity: config.shelterCapacity[name] ?? 500 });
  }

  if (hospitals.length < 2 || shelters.length < 3) {
    throw new Error(
      `Facility extraction failed for ${config.name} ` +
        `(${hospitals.length} hospitals, ${shelters.length} shelters)`,
    );
  }
  return { hospitals, shelters };
}

async function generateCity(config) {
  console.log(`\n== ${config.name} ==`);
  const xml = await loadOsm(config);
  const osm = parseOsm(xml);
  const segments = buildSegments(osm);
  const directed = contractSegments(segments);

  const used = new Set();
  for (const edge of directed) {
    used.add(edge.from);
    used.add(edge.to);
  }
  const keptNodes = [...used].sort((a, b) => a.localeCompare(b));

  const indexOf = new Map();
  const project = makeProjector(config.bbox);
  const nodes = keptNodes.map((id, index) => {
    indexOf.set(id, index);
    const osmNode = osm.nodes.get(id);
    const local = project(osmNode.lat, osmNode.lon);
    return { id: Number(id), x: local.x, y: local.y };
  });

  const edges = directed
    .map((edge) => ({
      from: indexOf.get(edge.from),
      to: indexOf.get(edge.to),
      lengthM: edge.lengthM,
      speedKph: edge.speedKph,
      road: edge.road,
    }))
    .filter((edge) => edge.from !== undefined && edge.to !== undefined)
    .sort((a, b) => a.from - b.from || a.to - b.to || a.lengthM - b.lengthM);

  const facilities = selectFacilities(osm, keptNodes, config);
  const hospitals = facilities.hospitals.map((facility) => ({
    ...facility,
    node: indexOf.get(facility.node),
  }));
  const shelters = facilities.shelters.map((facility) => ({
    ...facility,
    node: indexOf.get(facility.node),
  }));

  const lengthM = edges.reduce((sum, edge) => sum + edge.lengthM, 0) / 2;
  const { west, south, east, north } = config.bbox;
  const output = {
    meta: {
      name: config.name,
      source: 'OpenStreetMap',
      sourceUrl: 'https://www.openstreetmap.org/copyright',
      license: 'ODbL-1.0',
      attribution: '© OpenStreetMap contributors',
      bbox: [west, south, east, north],
      generatedAt: new Date().toISOString().slice(0, 10),
      generator: 'data/generate-preset.mjs',
      nodeCount: nodes.length,
      edgeCount: edges.length,
      roadKm: round(lengthM / 1000, 2),
    },
    nodes,
    edges,
    hospitals,
    shelters,
  };

  await writeFile(config.output, `${JSON.stringify(output)}\n`, 'utf8');
  console.log(
    `Wrote ${path.relative(process.cwd(), config.output)} — ` +
      `${nodes.length} nodes, ${edges.length} directed edges, ${output.meta.roadKm} road km`,
  );
  if (hospitals.some((h) => h.node === undefined) || shelters.some((s) => s.node === undefined)) {
    throw new Error('A facility was not snapped to the contracted graph');
  }
}

async function main() {
  await generateCity(PRESETS.seattle);
  await generateCity(PRESETS.mumbai);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
