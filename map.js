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

function computeStationTraffic(stations, trips) {
  // Compute departures
  const departures = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.start_station_id,
  );

  // Computed arrivals as you did in step 4.2
  const arrivals = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.end_station_id,
  );

  // Update each station..
  return stations.map((station) => {
    let id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    // what you updated in step 4.2
    station.departures = departures.get(id) ?? 0;

    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });
}

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function filterTripsbyTime(trips, timeFilter) {
  return timeFilter === -1
    ? trips // If no filter is applied (-1), return all trips
    : trips.filter((trip) => {
        // Convert trip start and end times to minutes since midnight
        const startedMinutes = minutesSinceMidnight(trip.started_at);
        const endedMinutes = minutesSinceMidnight(trip.ended_at);

        // Include trips that started or ended within 60 minutes of the selected time
        return (
          Math.abs(startedMinutes - timeFilter) <= 60 ||
          Math.abs(endedMinutes - timeFilter) <= 60
        );
      });
}

map.on('load', async () => {
  console.log('Map loaded');

  // Add bike lane sources
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });

  map.addSource('cambridge-route', {
    type: 'geojson',
    data: 'biking-in-boston/data/RECREATION_BikeFacilities.geojson',
  });

  // Add bike lane layers
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

  try {
    // Load station JSON
    const jsonurl = 'biking-in-boston/data/bluebikes-stations.json';
    const jsonData = await d3.json(jsonurl);

    // Load trips CSV and parse dates
    let trips = await d3.csv(
      'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
      (trip) => {
        trip.started_at = new Date(trip.started_at);
        trip.ended_at = new Date(trip.ended_at);
        return trip;
      },
    );

    // Compute initial station traffic
    const stations = computeStationTraffic(jsonData.data.stations, trips);

    // Set up the circle radius scale
    const radiusScale = d3
      .scaleSqrt()
      .domain([0, d3.max(stations, (d) => d.totalTraffic)])
      .range([0, 25]);

    // Append circles to the SVG for each station
    svg
      .selectAll('circle')
      .data(stations, (d) => d.short_name)
      .enter()
      .append('circle')
      .attr('class', 'circle')
      .attr('r', (d) => radiusScale(d.totalTraffic)) // Radius of the circle
      .attr('fill', 'steelblue') // Circle fill color
      .attr('stroke', 'white') // Circle border color
      .attr('stroke-width', 1) // Circle border thickness
      .attr('opacity', 0.8) // Circle opacity
      .style('--departure-ratio', (d) =>
        stationFlow(d.departures / d.totalTraffic),
      )
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
      svg
        .selectAll('circle')
        .attr('cx', (d) => getCoords(d).cx) // Set the x-position using projected coordinates
        .attr('cy', (d) => getCoords(d).cy); // Set the y-position using projected coordinates
    }

    // Initial position update when map loads
    updatePositions();

    // Reposition markers on map interactions
    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);

    // Time slider references
    const timeSlider = document.getElementById('timeSlider');
    const selectedTime = document.getElementById('selectedTime');
    const anyTimeLabel = document.getElementById('anyTime');

    // Helper: Convert minutes to HH:MM AM/PM
    function formatTime(minutes) {
      const date = new Date(0, 0, 0, 0, minutes); // Set hours & minutes
      return date.toLocaleString('en-US', { timeStyle: 'short' });
    }

    // Helper: Convert Date object to minutes since midnight
    function minutesSinceMidnight(date) {
      return date.getHours() * 60 + date.getMinutes();
    }

    // Filter trips based on slider time
    function filterTripsbyTime(trips, timeFilter) {
      return timeFilter === -1
        ? trips
        : trips.filter((trip) => {
            const startedMinutes = minutesSinceMidnight(trip.started_at);
            const endedMinutes = minutesSinceMidnight(trip.ended_at);
            return (
              Math.abs(startedMinutes - timeFilter) <= 60 ||
              Math.abs(endedMinutes - timeFilter) <= 60
            );
          });
    }

    // Update scatterplot based on time filter
    function updateScatterPlot(timeFilter) {
      const filteredTrips = filterTripsbyTime(trips, timeFilter);
      const filteredStations = computeStationTraffic(stations, filteredTrips);

      // Adjust circle radius scale based on filtering
      timeFilter === -1
        ? radiusScale.range([0, 25]) // default when no filter
        : radiusScale.range([3, 50]); // larger circles when filtered

      // Update circles with D3 join
      svg
        .selectAll('circle')
        .data(filteredStations, (d) => d.short_name)
        .join(
          (enter) =>
            enter
              .append('circle')
              .attr('class', 'circle')
              .attr('fill', 'steelblue')
              .attr('stroke', 'white')
              .attr('stroke-width', 1)
              .attr('opacity', 0.8)
              .call((sel) => sel.append('title')),
          (update) => update,
          (exit) => exit.remove(),
        )
        .attr('r', (d) => radiusScale(d.totalTraffic))
        .style('--departure-ratio', (d) =>
          stationFlow(d.departures / d.totalTraffic),
        )
        .each(function (d) {
          d3.select(this)
            .select('title')
            .text(
              `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
            );
        });

      // Update circle positions after joining
      updatePositions();
    }

    // Update time display and trigger scatterplot update
    function updateTimeDisplay() {
      const timeFilter = Number(timeSlider.value);
      if (timeFilter === -1) {
        selectedTime.textContent = '';
        anyTimeLabel.style.display = 'block';
      } else {
        selectedTime.textContent = formatTime(timeFilter);
        anyTimeLabel.style.display = 'none';
      }
      updateScatterPlot(timeFilter);
    }

    // Event listener for slider
    timeSlider.addEventListener('input', updateTimeDisplay);
    updateTimeDisplay(); // Initialize display
  } catch (error) {
    console.error('Error loading JSON or CSV:', error);
  }
});

let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);
