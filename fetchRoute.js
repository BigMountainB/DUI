#!/usr/bin/env node
/**
 * fetchRoute.js — One-time route data fetcher.
 *
 * Run:    node fetchRoute.js
 * Output: src/road/routeGeo.json
 *
 * No API keys required. Uses:
 *   • OSRM public routing  — router.project-osrm.org
 *   • Open-Meteo elevation — api.open-meteo.com
 */
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Waypoints: Seattle → Miami via northern US route ─────────────────────────
const WAYPOINTS = [
  [-122.3321, 47.6062],  // Seattle, WA
  [-122.6750, 45.5051],  // Portland, OR
  [-116.2023, 43.6150],  // Boise, ID
  [-104.8197, 41.1400],  // Cheyenne, WY
  [-104.9903, 39.7392],  // Denver, CO
  [ -97.3375, 37.6922],  // Wichita, KS
  [ -94.5786, 39.0997],  // Kansas City, MO
  [ -92.2896, 34.7465],  // Little Rock, AR
  [ -90.0490, 35.1495],  // Memphis, TN
  [ -86.8025, 33.5186],  // Birmingham, AL
  [ -84.3880, 33.7490],  // Atlanta, GA
  [ -81.6557, 30.3322],  // Jacksonville, FL
  [ -80.1918, 25.7617],  // Miami, FL
];

const SAMPLE_COUNT = 800;   // points sampled along the route
const ELEV_BATCH   = 100;   // Open-Meteo max locations per request

// ── Geo utilities ─────────────────────────────────────────────────────────────
function haversine([lon1, lat1], [lon2, lat2]) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    = Math.sin(dLat/2)**2
             + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function bearing([lon1, lat1], [lon2, lat2]) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y    = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x    = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180)
             - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  return Math.atan2(y, x);
}

function angleDiff(a, b) {
  let d = b - a;
  while (d >  Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function resampleByArcLength(coords, n) {
  const cumDist = [0];
  for (let i = 1; i < coords.length; i++)
    cumDist.push(cumDist[i-1] + haversine(coords[i-1], coords[i]));

  const total = cumDist[cumDist.length - 1];
  console.log(`  Total route: ${Math.round(total)} km  (${Math.round(total * 0.621)} miles)`);

  const result = [];
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total;
    let lo = 0, hi = cumDist.length - 2;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumDist[mid + 1] < target) lo = mid + 1; else hi = mid;
    }
    const segLen = cumDist[lo + 1] - cumDist[lo];
    const t      = segLen === 0 ? 0 : (target - cumDist[lo]) / segLen;
    const [lon1, lat1] = coords[lo];
    const [lon2, lat2] = coords[Math.min(lo + 1, coords.length - 1)];
    result.push([lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t]);
  }
  return result;
}

function smooth(arr, strength) {
  const out = [...arr];
  for (let i = 1; i < arr.length; i++)
    out[i] = out[i-1] * (1 - strength) + arr[i] * strength;
  return out;
}

function round6(v) { return Math.round(v * 1e6) / 1e6; }

// ── API calls ─────────────────────────────────────────────────────────────────
async function fetchOSRM() {
  const coordStr = WAYPOINTS.map(([lon, lat]) => `${lon},${lat}`).join(';');
  const url      = `http://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
  console.log('Fetching OSRM route...');
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.code !== 'Ok') throw new Error(`OSRM: ${data.code} — ${data.message ?? ''}`);
  return data.routes[0].geometry.coordinates; // [[lon, lat], ...]
}

async function fetchElevation(points) {
  const all = [];
  for (let i = 0; i < points.length; i += ELEV_BATCH) {
    const batch = points.slice(i, i + ELEV_BATCH);
    const lats  = batch.map(p => p[1].toFixed(5)).join(',');
    const lons  = batch.map(p => p[0].toFixed(5)).join(',');
    const url   = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;
    process.stdout.write(`  Elevation ${Math.ceil(i/ELEV_BATCH)+1}/${Math.ceil(points.length/ELEV_BATCH)}... `);
    try {
      const res  = await fetch(url);
      const data = await res.json();
      all.push(...(data.elevation ?? new Array(batch.length).fill(0)));
      console.log('OK');
    } catch {
      all.push(...new Array(batch.length).fill(0));
      console.log('failed (using 0)');
    }
  }
  return all;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  try {
    // 1. Route geometry from OSRM
    const rawCoords = await fetchOSRM();
    console.log(`  Got ${rawCoords.length} raw points`);

    // 2. Resample to uniform spacing
    console.log(`Resampling to ${SAMPLE_COUNT} points...`);
    const points = resampleByArcLength(rawCoords, SAMPLE_COUNT);

    // 3. Curves from bearing changes
    //    Scale: a 1° heading change per sample (~7 km) ≈ gentle curve in game
    const rawCurves = points.map((_, i) => {
      if (i === 0 || i === points.length - 1) return 0;
      return angleDiff(bearing(points[i-1], points[i]), bearing(points[i], points[i+1])) * 0.06;
    });
    const curves = smooth(rawCurves, 0.07).map(round6);

    // 4. Elevation data
    console.log('Fetching elevation...');
    const elevations = await fetchElevation(points);

    // 5. Hills from elevation delta
    //    100 m change per sample (~7 km) → moderate hill
    const rawHills = elevations.map((elev, i) =>
      i === 0 ? 0 : (elev - elevations[i-1]) * 0.0010
    );
    const hills = smooth(rawHills, 0.07).map(round6);

    // 6. Write output
    const output     = { samples: SAMPLE_COUNT, curves, hills };
    const outputPath = join(__dirname, 'src/road/routeGeo.json');
    writeFileSync(outputPath, JSON.stringify(output));

    const cMin = Math.min(...curves).toFixed(4), cMax = Math.max(...curves).toFixed(4);
    const hMin = Math.min(...hills).toFixed(4),  hMax = Math.max(...hills).toFixed(4);
    console.log(`\nWrote ${outputPath}`);
    console.log(`Curves: ${cMin} → ${cMax}`);
    console.log(`Hills:  ${hMin} → ${hMax}`);
    console.log('\nDone! Restart the dev server to load the real route.');

  } catch (err) {
    console.error('\nFailed:', err.message);
    process.exit(1);
  }
}

main();
