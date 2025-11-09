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

// Global variables
let timeFilter = -1; // Default value for time filter
let stations = []; // Will hold station data
let trips = []; // Will hold trip data

function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
  const { x, y } = map.project(point); // Project to pixel coordinates
  return { cx: x, cy: y }; // Return as object for use in SVG attributes
}

// Global function to compute station traffic
function computeStationTraffic(stations, trips) {
  // Compute departures
  const departures = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.start_station_id,
  );

  // Compute arrivals
  const arrivals = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.end_station_id,
  );

  // Update each station
  return stations.map((station) => {
    let id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });
}

// Helper to format minutes since midnight to HH:MM AM/PM
function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes); // Set hours & minutes
  return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
}

// Helper to get minutes since midnight from a Date object
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// Filter trips based on timeFilter (±60 minutes)
function filterTripsByTime(trips, timeFilter) {
  if (timeFilter === -1) return trips; // No filter
  return trips.filter((trip) => {
    const startMin = minutesSinceMidnight(trip.started_at);
    const endMin = minutesSinceMidnight(trip.ended_at);
    return (
      Math.abs(startMin - timeFilter) <= 60 ||
      Math.abs(endMin - timeFilter) <= 60
    );
  });
}

// Reactive function to update scatterplot
function updateScatterPlot(timeFilter) {
  const filteredTrips = filterTripsByTime(trips, timeFilter);
  const filteredStations = computeStationTraffic(stations, filteredTrips);

  // Adjust circle size scale dynamically
  timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);

  // Update the scatterplot circles
  circles
    .data(filteredStations, (d) => d.short_name) // Key ensures D3 reuses elements
    .join('circle')
    .attr('r', (d) => radiusScale(d.totalTraffic))
    .attr('cx', (d) => getCoords(d).cx)
    .attr('cy', (d) => getCoords(d).cy)
    .attr('fill', 'steelblue')
    .attr('stroke', 'white')
    .attr('stroke-width', 1)
    .attr('opacity', 0.8)
    .each(function (d) {
      d3.select(this)
        .select('title')
        .text(
          `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
        );
    });
}

map.on('load', async () => {
  console.log('Map loaded');

  // Add GeoJSON sources for bike lanes
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });

  map.addSource('cambridge-route', {
    type: 'geojson',
    data: '../data/RECREATION_BikeFacilities.geojson',
  });

  // Add layers for bike lanes
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

  // Declare variables for circles and radiusScale so they are accessible globally in this function
  let circles;
  let radiusScale;

  try {
    // Load station data
    const jsonurl = '../data/bluebikes-stations.json';
    const jsonData = await d3.json(jsonurl);

    stations = jsonData.data.stations; // Keep a reference to all stations

    // Load trip data and parse dates
    const trafficUrl =
      'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';
    trips = await d3.csv(trafficUrl, (trip) => {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.ended_at);
      return trip;
    });

    // Initial traffic computation
    stations = computeStationTraffic(stations, trips);

    // Create radius scale
    radiusScale = d3
      .scaleSqrt()
      .domain([0, d3.max(stations, (d) => d.totalTraffic)])
      .range([0, 25]);

    // Append initial circles
    circles = svg
      .selectAll('circle')
      .data(stations, (d) => d.short_name) // Key ensures D3 reuses elements
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
    console.error('Error loading data:', error); // Handle errors
  }

  // Slider reactivity
  const timeSlider = document.getElementById('timeSlider');
  const selectedTime = document.getElementById('selectedTime');
  const anyTimeLabel = document.getElementById('anyTime');

  // Function to update time display and trigger scatterplot update
  function updateTimeDisplay() {
    timeFilter = Number(timeSlider.value); // Get slider value

    if (timeFilter === -1) {
      selectedTime.textContent = ''; // Clear time display
      anyTimeLabel.style.display = 'block'; // Show "(any time)"
    } else {
      selectedTime.textContent = formatTime(timeFilter); // Display formatted time
      anyTimeLabel.style.display = 'none'; // Hide "(any time)"
    }

    // Call updateScatterPlot to reflect the changes on the map
    updateScatterPlot(timeFilter);
  }

  timeSlider.addEventListener('input', updateTimeDisplay);
  updateTimeDisplay(); // Initialize display and scatterplot
});
