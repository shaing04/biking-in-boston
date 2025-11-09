import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Import Mapbox as an ESM module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';

// Check that Mapbox GL JS is loaded
console.log('Mapbox GL JS Loaded:', mapboxgl);

// Set your Mapbox access token here
mapboxgl.accessToken =
  'pk.eyJ1Ijoic2hhaW5nMDQiLCJhIjoiY21oczFxOTd2MDg2czJsb2phMzB2YnVoaCJ9.iuC4LgynFGhnzK4aFN1pzw';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.05653723995204, 42.35724238998872], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});

function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
  const { x, y } = map.project(point); // Project to pixel coordinates
  return { cx: x, cy: y }; // Return as object for use in SVG attributes
}

map.on('load', async () => {
  //code
  console.log('Map loaded');

  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });

  map.addSource('cambridge-route', {
    type: 'geojson',
    data: '../data/RECREATION_BikeFacilities.geojson',
  });

  map.addLayer({
    id: 'bike-lanes-boston',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': '#32D400', // A bright green using hex code
      'line-width': 5, // Thicker lines
      'line-opacity': 0.6, // Slightly less transparent
    },
  });

  map.addLayer({
    id: 'bike-lanes-cambridge',
    type: 'line',
    source: 'cambridge-route',
    paint: {
      'line-color': '#32D400', // A bright green using hex code
      'line-width': 5, // Thicker lines
      'line-opacity': 0.6, // Slightly less transparent
    },
  });

  const svg = d3.select('#map').select('svg');
  console.log('SVG overlay select:', svg);

  let jsonData;
  try {
    const jsonurl = '../data/bluebikes-stations.json';
    // Await JSON fetch
    const jsonData = await d3.json(jsonurl);
    //console.log('Loaded JSON Data:', jsonData); // Log to verify structure

    let stations = jsonData.data.stations;
    //console.log('Stations Array:', stations);

    const trafficUrl =
      'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';
    // Await CSV fetch
    const trips = await d3.csv(trafficUrl);
    //console.log('Loaded Traffic Data:', trips); // Log to verify structure

    const departures = d3.rollup(
      trips,
      (v) => v.length,
      (d) => d.start_station_id,
    );

    const arrivals = d3.rollup(
      trips,
      (v) => v.length,
      (d) => d.end_station_id,
    );

    // Add arrivals, departures, totalTraffic to each station
    stations = stations.map((station) => {
      let id = station.short_name;
      station.arrivals = arrivals.get(id) ?? 0;

      // TODO departures
      station.departures = departures.get(id) ?? 0;

      // TODO totalTraffic
      station.totalTraffic = station.arrivals + station.departures;
      return station;
    });

    const radiusScale = d3
      .scaleSqrt()
      .domain([0, d3.max(stations, (d) => d.totalTraffic)])
      .range([0, 25]);

    // Append circles to the SVG for each station
    const circles = svg
      .selectAll('circle')
      .data(stations)
      .enter()
      .append('circle')
      .attr('r', (d) => radiusScale(d.totalTraffic)) // Radius of the circle
      .attr('fill', 'steelblue') // Circle fill color
      .attr('stroke', 'white') // Circle border color
      .attr('stroke-width', 1) // Circle border thickness
      .attr('opacity', 0.8) // Circle opacity
      .each(function (d) {
        // Add <title> for browser tooltips
        d3.select(this)
          .append('title')
          .text(
            `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
          );
      });

    // Function to update circle positions when the map moves/zooms
    function updatePositions() {
      circles
        .attr('cx', (d) => getCoords(d).cx) // Set the x-position using projected coordinates
        .attr('cy', (d) => getCoords(d).cy); // Set the y-position using projected coordinates
    }

    // Initial position update when map loads
    updatePositions();

    // Reposition markers on map interactions
    map.on('move', updatePositions); // Update during map movement
    map.on('zoom', updatePositions); // Update during zooming
    map.on('resize', updatePositions); // Update on window resize
    map.on('moveend', updatePositions); // Final adjustment after movement ends
  } catch (error) {
    console.error('Error loading JSON:', error); // Handle errors
  }
});
