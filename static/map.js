let map = L.map('map').setView([51.4036, 5.7483], 13);
let bufferLayer = null;
let selectedPoint = null;
let startPoint = null;
let endPoint = null;
let routeLayer = null;
let functionMode = "reachableArea";
let isochroneLayer = null;
let selectedPoints = [];
let searchMarker = null;

// Basemap en layer switcher instellen
const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
    maxZoom: 19, 
    attribution: '&copy; OpenStreetMap contributors' 
});

const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { 
    maxZoom: 20, 
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community' 
});

const terrainLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { 
    maxZoom: 17, 
    attribution: '&copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)' 
});

const darkLayer = L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png', { 
    maxZoom: 20, 
    attribution: '&copy; OpenMapTiles &copy; OpenStreetMap contributors' 
});

const lightLayer = L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png', { 
    maxZoom: 20, 
    attribution: '&copy; OpenMapTiles &copy; OpenStreetMap contributors' 
});

const transportLayer = L.tileLayer('https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png', { 
    maxZoom: 18, 
    attribution: '&copy; OpenStreetMap contributors | Tiles style by MeMoMaps.de' 
});

const customIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/252/252025.png', // Een voorbeeldicoon (vervang dit door je eigen URL)
    iconSize: [40, 40], // Grootte van de marker
    iconAnchor: [15, 30], // Veranker het icoon op het juiste punt
    popupAnchor: [0, -30] // Zorg dat de pop-up correct boven de marker staat
});

// Voeg de standaard laag toe aan de kaart
streetLayer.addTo(map);

const baseLayers = { 
    "Street": streetLayer, 
    "Satellite": satelliteLayer,
    "Terrain": terrainLayer,
    "Dark": darkLayer,
    "Light": lightLayer,
    "Transport": transportLayer
};

L.control.layers(baseLayers).addTo(map);

// Zoekbalk functionaliteit met verwijder functie
L.Control.geocoder({
    defaultMarkGeocode: false,
    collapsed: false
})
    .on('markgeocode', function (e) {
        const latlng = e.geocode.center;

        // Verwijder bestaande zoekmarker
        if (searchMarker) {
            map.removeLayer(searchMarker);
        }

        // Voeg een nieuwe marker toe
        searchMarker = L.marker(latlng, { icon: customIcon }).addTo(map);
        searchMarker.bindPopup(`<div class="popup-container">
            <b>${e.geocode.name}</b><br>
            <button id="removeSearchMarker" class="popup-remove-btn">Remove</button>
        </div>`).openPopup();

        // Vertraging om DOM volledig te laden voordat event listener wordt toegevoegd
        setTimeout(() => {
            const removeBtn = document.getElementById('removeSearchMarker');
            if (removeBtn) {
                removeBtn.addEventListener('click', function () {
                    map.removeLayer(searchMarker);
                    searchMarker = null;
                });
            }
        }, 100);

        map.setView(latlng, 15);
    })
    .addTo(map);


    document.getElementById('functionSwitch').addEventListener('change', function () {
        const selectedFunction = this.value;

        functionMode = selectedFunction;
        console.log("Function mode updated to:", functionMode);
    
        // Alle controles verbergen
        document.getElementById('reachableControls').style.display = 'none';
        document.getElementById('routeControls').style.display = 'none';
        document.getElementById('bufferControls').style.display = 'none';
    
        // Toon specifieke controles
        if (selectedFunction === 'reachableArea') {
            document.getElementById('reachableControls').style.display = 'block';
        } else if (selectedFunction === 'shortestRoute') {
            document.getElementById('routeControls').style.display = 'block';
        } else if (selectedFunction === 'Buffer') {
            document.getElementById('bufferControls').style.display = 'block';
        }
    });
    

// Reset markers functie: wat wordt gereset na het drukkken op de resetknop?
function resetMarkers() {
    if (bufferLayer) map.removeLayer(bufferLayer);
    if (routeLayer) map.removeLayer(routeLayer);
    if (selectedPoint) map.removeLayer(selectedPoint);
    if (startPoint) map.removeLayer(startPoint);
    if (endPoint) map.removeLayer(endPoint);
    if (searchMarker) map.removeLayer(searchMarker)
    selectedPoint = startPoint = endPoint = routeLayer = searchMarker = null;
}

// POP UP EN MARKER OPMAAK
map.on('click', function (e) {
    const markerOptions = (color) => ({ });
    console.log("Current function mode:", functionMode);
    console.log("StartPoint exists:", !!startPoint);
    console.log("EndPoint exists:", !!endPoint);

    if (functionMode === "reachableArea") {
        if (selectedPoint) map.removeLayer(selectedPoint);
        selectedPoint = L.marker(e.latlng, markerOptions('blue'))
            .addTo(map)
            .bindPopup("Starting Point")
            .openPopup();
    } else if (functionMode === "shortestRoute") {
        if (!startPoint) {
            startPoint = L.marker(e.latlng, markerOptions('green'))
                .addTo(map)
                .bindPopup("Start Point")
                .openPopup();
        } else if (!endPoint) {
            endPoint = L.marker(e.latlng, markerOptions('red'))
                .addTo(map)
                .bindPopup("End Point")
                .openPopup();
        } else {
            alert("Both points are already selected. Reset to choose again.");
        }
    } else if (functionMode === "Buffer") {
        if (selectedPoint) map.removeLayer(selectedPoint);
        selectedPoint = L.marker(e.latlng, markerOptions('purple'))
            .addTo(map)
            .bindPopup("Buffer Point")
            .openPopup();
    }

});




//FUNCTIE 1 Bereikbare gebieden berekenen
// Event listener voor de knop 'Calculate Reachable Area'
document.getElementById('calculateReachableAreaBtn').addEventListener('click', function () {
    // 1. Controleer of er een startpunt is geselecteerd
    if (!selectedPoint) {
        alert("Please select a starting point by clicking on the map.");
        return; // Stop verdere uitvoering
    }

    // 2. Haal de reismodus en tijd op
    const mode = document.getElementById('mode').value;
    const time = document.getElementById('time').value;

    // 3. Valideer de invoer (tijd moet een positief getal zijn)
    if (!time || isNaN(time) || time <= 0) {
        alert("Please enter a valid time in minutes.");
        return; // Stop verdere uitvoering
    }

    // 4. Haal de coördinaten van het geselecteerde punt op
    const lat = selectedPoint.getLatLng().lat;
    const lng = selectedPoint.getLatLng().lng;

    // 5. Toon laadindicator (indien aanwezig in je HTML)
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block';

    // 6. Maak een fetch-aanroep naar de backend om de gegevens op te halen
    fetch('/calculate_reach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            lat: lat,
            lng: lng,
            mode: mode,
            time: parseFloat(time) // Zet tijd om naar een getal
        })
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with status ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Controleer of de backend een geldig GeoJSON-object retourneert
            if (!data || data.type !== "FeatureCollection") {
                throw new Error("Invalid GeoJSON format received.");
            }

            // Verwijder oude kaartlagen (indien aanwezig)
            if (bufferLayer) map.removeLayer(bufferLayer);

            // Voeg de nieuwe GeoJSON-laag toe aan de kaart
            bufferLayer = L.geoJSON(data, {
                style: function (feature) {
                    const highway = feature.properties.highway || 'unknown';

                    if (highway === 'footway') {
                        return { color: 'green', weight: 2, opacity: 0.6 }; // Wandelen
                    }
                    if (highway === 'cycleway') {
                        return { color: 'orange', weight: 2, opacity: 0.6 }; // Fietsen
                    }
                    return { color: 'red', weight: 2, opacity: 0.6 }; // Rijden
                }
            }).addTo(map);

            // Optioneel: Werk een details-paneel bij (indien aanwezig)
            updateDetailsPane(
                "Reachable Area Analysis",
                `<p><strong>Mode:</strong> ${mode}</p>
                <p><strong>Time:</strong> ${time} minutes</p>
                <p><strong>Latitude:</strong> ${lat.toFixed(6)}</p>
                <p><strong>Longitude:</strong> ${lng.toFixed(6)}</p>
                <p>Reachable area has been successfully calculated and displayed on the map.</p>`
            );
        })
        .catch(error => {
            console.error("Error during fetch:", error);
            alert("An error occurred while calculating the reachable area. Please try again.");
        })
        .finally(() => {
            // Verberg laadindicator
            if (loadingIndicator) loadingIndicator.style.display = 'none';
        });
});



// FUNCTIE 2 Kortste route berekenen
document.getElementById('calculateRouteBtn').addEventListener('click', function () {
    if (!startPoint || !endPoint) {
        alert("Please select a start and end point on the map.");
        return;
    }

    const mode = document.getElementById('routeMode').value;

    // Toon laadicoon
    const loadingIndicator = document.getElementById('loadingIndicator');
    loadingIndicator.style.display = 'block';

    fetch('/calculate_route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            start: [startPoint.getLatLng().lat, startPoint.getLatLng().lng],
            end: [endPoint.getLatLng().lat, endPoint.getLatLng().lng],
            mode: mode
        })
    })
        .then(response => response.json())
        .then(data => {
            if (!data || data.type !== "FeatureCollection") {
                throw new Error("Invalid GeoJSON format received.");
            }

            // Verwijder oude route indien aanwezig
            if (routeLayer) map.removeLayer(routeLayer);

            // Voeg nieuwe route toe met aangepaste styling
            routeLayer = L.geoJSON(data, {
                style: function (feature) {
                    const mode = feature.properties.mode;
                    let color = "blue"; // Default kleur

                    if (mode === "walk") {
                        color = "green"; // Groene lijnen voor wandelen
                    } else if (mode === "bike") {
                        color = "orange"; // Oranje lijnen voor fietsen
                    } else if (mode === "drive") {
                        color = "red"; // Rode lijnen voor autoroutes
                    }

                    return { color: color, weight: 4, opacity: 0.8 };
                }
            }).addTo(map);
        })
        .catch(error => {
            console.error("Error calculating route:", error);
            alert("An error occurred while calculating the route.");
        })
        .finally(() => {
            // Verberg laadicoon
            loadingIndicator.style.display = 'none';
        });
});

// FUNCTIE 3 BUFFERS MAKEN
document.getElementById('calculateBufferBtn').addEventListener('click', function () {
    if (!selectedPoint) {
        alert("Please select a point by clicking on the map.");
        return;
    }

    // Haal de invoerwaarden op
    const times = [
        parseFloat(document.getElementById('buffer1').value),
        parseFloat(document.getElementById('buffer2').value),
        parseFloat(document.getElementById('buffer3').value)
    ];
    const mode = document.getElementById('modeBuffer').value;

    // Definieer geschatte snelheden per vervoerswijze (in meters per minuut)
    const speed = { walk: 83.33, bike: 250, drive: 833.33 };  // Geschatte snelheid in meters per minuut

    // Verwijder oude buffers als die er zijn
    if (bufferLayer) map.removeLayer(bufferLayer);
    bufferLayer = L.layerGroup().addTo(map);

    // Definieer paarse kleuren voor elke buffer
    const colors = ['#4B0082', '#9370DB', '#D8BFD8'];  // Unieke paarse kleuren
    
    // Maak cirkels voor elke buffer tijd
    times.forEach((time, index) => {
        const estimatedRadius = speed[mode] * time;  // Bereken radius in meters
        L.circle(selectedPoint.getLatLng(), {
            radius: estimatedRadius,
            color: colors[index],
            fillColor: colors[index],
            fillOpacity: 0.5,
            weight: 1
        }).addTo(bufferLayer);
    });
});



// RESET WAARDES
document.getElementById('resetMarkersBtn').addEventListener('click', resetMarkers);

// INFOMELDINGEN EN INFOBUTTON
// Info beschrijvingen voor elke functie
const functionDescriptions = {
    choosefunction: "Choose a function",
    reachableArea: "Calculate the area reachable within a certain time based on the selected mode of travel. Select a point on the map, choose a travel mode (walking, cycling, or driving), and enter the time in minutes. The system will display a buffer that shows how far you can travel within that time.",
    shortestRoute: "This function calculates the shortest route between two selected points on the map. First, click on the map to select a starting point, then click on another point to select the endpoint. The system will display the fastest route between these two points.",
    Buffer: "The Buffer function creates circles around a selected point based on travel time. You can enter multiple times, and the map will display buffers in different shades of purple for each time, based on the selected mode of travel."
};

// Selecteer elementen
const infoIcon = document.getElementById('infoIcon');
const infoModal = document.getElementById('infoModal');
const closeModal = document.getElementById('closeModal');
const modalText = document.getElementById('modalText');
const functionSwitch = document.getElementById('functionSwitch');

// Event listener voor het info-icoon
infoIcon.addEventListener('click', () => {
    // Haal de huidige functiebeschrijving op
    const selectedFunction = functionSwitch.value;
    modalText.innerText = functionDescriptions[selectedFunction];
    infoModal.style.display = 'block';
});

// Sluit de modal wanneer op "x" wordt geklikt
closeModal.addEventListener('click', () => {
    infoModal.style.display = 'none';
});

// Sluit de modal wanneer buiten de modal wordt geklikt
window.addEventListener('click', (event) => {
    if (event.target === infoModal) {
        infoModal.style.display = 'none';
    }
});

document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
        // Maak alle tabs inactief
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        // Activeer de geselecteerde tab
        const tabId = button.getAttribute('data-tab');
        button.classList.add('active');
        document.getElementById(tabId).classList.add('active');
    });
});

document.getElementById('toggleDetailsBtn').addEventListener('click', function () {
    const detailsContent = document.getElementById('detailsContent');
    
    if (detailsContent.style.display === "none" || detailsContent.style.display === "") {
        detailsContent.style.display = "block";
        this.innerText = "▲ Hide Details";
    } else {
        detailsContent.style.display = "none";
        this.innerText = "▼ Details";
    }
});


function updateDetailsPane(title, body) {
    const detailsTitle = document.getElementById('detailsTitle');
    const detailsBody = document.getElementById('detailsBody');

    if (detailsTitle) detailsTitle.innerText = title;
    if (detailsBody) detailsBody.innerHTML = body;

    const detailsContent = document.getElementById('detailsContent');
    if (detailsContent && detailsContent.classList.contains('hidden')) {
        detailsContent.classList.remove('hidden');
    }
}

function resetDetailsPane() {
    const detailsContent = document.getElementById('detailsContent');
    const legendContainer = document.getElementById('legendContainer');

    if (detailsContent) detailsContent.classList.add('hidden');
    if (legendContainer) legendContainer.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', function () {
    const toggleDetailsBtn = document.getElementById('toggleDetailsBtn');
    const detailsContent = document.getElementById('detailsContent');

    if (toggleDetailsBtn && detailsContent) {
        toggleDetailsBtn.addEventListener('click', function () {
            if (detailsContent.classList.contains('hidden')) {
                detailsContent.classList.remove('hidden');
                toggleDetailsBtn.innerText = "▲ Hide Details";
            } else {
                detailsContent.classList.add('hidden');
                toggleDetailsBtn.innerText = "▼ Details";
            }
        });
    }
});

function updateLegend(mode, functionMode) {
    const legendContainer = document.querySelector('#staticLegend ul');
    if (!legendContainer) return;

    let legends = {
        reachableArea: {
            walk: 'Green: Walkable Paths',
            bike: 'Orange: Cyclable Paths',
            drive: 'Red: Drivable Paths'
        },
        shortestRoute: {
            route: 'Blue: Shortest Route Path'
        },
        buffer: {
            buffer: 'Purple: Travel Time Buffers'
        }
    };
    
    legendContainer.innerHTML = ''; // Wis bestaande inhoud

    if (functionMode === 'reachableArea' || functionMode === 'shortestRoute') {
        legendContainer.innerHTML = `
            <li><span class="legend-line" style="background: green"></span> Walkable Paths</li>
            <li><span class="legend-line" style="background: orange"></span> Cyclable Paths</li>
            <li><span class="legend-line" style="background: red"></span> Drivable Paths</li>
        `;
    } else if (functionMode === 'Buffer') {
        legendContainer.innerHTML = '<li><span class="legend-line" style="background: purple"></span> Travel Time Buffers</li>';
    }
}

// Functieswitch-update
functionSwitch.addEventListener('change', function () {
    const functionMode = this.value;
    updateLegend(document.getElementById('mode').value, functionMode);
});
