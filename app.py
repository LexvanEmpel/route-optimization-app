# Dit is de back-end van je applicatie. Het behandelt HTTP-verzoeken en voert berekeningen uit met de OSMnx-bibliotheek.

from flask import Flask, render_template, request, jsonify
import osmnx as ox
import networkx as nx
import geopandas as gpd
import pandas as pd
import json
import warnings
import os
from shapely.geometry import MultiPolygon, Polygon, mapping
from flask_cors import CORS

warnings.filterwarnings("ignore", category=FutureWarning)


app = Flask(__name__)
CORS(app)

# Render de startpagina (index.html).
# Waarom belangrijk: Zorgt voor de connectie tussen de front-end en back-end.
@app.route('/')
def home():
    return render_template('index.html')

# FUNCTIE 1 CALCULAT_REACH Bereken bereikbare gebieden gebaseerd op reistijd en reismodus.
@app.route('/calculate_reach', methods=['POST'])
def calculate_reach():
    # Ontvang de JSON-data
    data = request.get_json()
    lat, lng = data.get('lat'), data.get('lng')
    mode, time = data.get('mode'), data.get('time')

    # Controleer of alle parameters aanwezig zijn
    if not all([lat, lng, mode, time]):
        print("Missing input parameters. Received data:", data)
        return jsonify({"error": "Missing input parameters"}), 400

    print("Received parameters:", lat, lng, mode, time)

    # Bereken de maximale afstand
    travel_speeds = {'walk': 5, 'bike': 15, 'drive': 50}  # km/h
    speed = travel_speeds.get(mode, 5)
    time_hours = time / 60  # minuten omrekenen naar uren
    max_distance = speed * time_hours * 1000  # afstand in meters

    # Probeer de graaf te laden
    try:
        G = ox.graph_from_point((lat, lng), dist=max_distance, network_type='all')
        print("Graph successfully loaded.")
    except Exception as e:
        print("Error loading graph:", e)
        return jsonify({"error": "Graph load failed"}), 500

    # Pas filters toe op basis van de transportmodus
    if mode == 'drive':
        print("Applying drive filters.")
        driving_highways = [
            'motorway', 'motorway_link', 'trunk', 'trunk_link',
            'primary', 'primary_link', 'secondary', 'secondary_link',
            'tertiary', 'tertiary_link', 'residential', 'service', 'unclassified'
        ]
        edges_to_remove = [
            (u, v, k) for u, v, k, data in G.edges(keys=True, data=True)
            if data.get('highway') not in driving_highways
        ]
        G.remove_edges_from(edges_to_remove)
        G = ox.add_edge_speeds(G)
        G = ox.add_edge_travel_times(G)

    elif mode == 'walk':
        print("Applying walk filters.")
        walking_highways = [
            'footway', 'path', 'pedestrian', 'residential', 'service',
            'track', 'unclassified', 'cycleway'
        ]
        edges_to_remove = []
        for u, v, k, data in G.edges(keys=True, data=True):
            if (
                data.get('highway') not in walking_highways or
                data.get('access') == 'no' or
                data.get('foot') == 'no'
            ):
                edges_to_remove.append((u, v, k))
        G.remove_edges_from(edges_to_remove)

        for u, v, k, data in G.edges(data=True, keys=True):
            data['speed_kph'] = 5
            data['travel_time'] = (data['length'] / 1000) / 5 * 3600  # in seconden

    elif mode == 'bike':
        print("Applying bike filters.")
        edges_to_remove = [
            (u, v, k) for u, v, k, data in G.edges(keys=True, data=True)
            if data.get('highway') in ['motorway', 'motorway_link']
        ]
        G.remove_edges_from(edges_to_remove)

        for u, v, k, data in G.edges(data=True, keys=True):
            data['speed_kph'] = 15
            data['travel_time'] = (data['length'] / 1000) / 15 * 3600

    # Bereken bereikbare nodes
    try:
        origin_node = ox.distance.nearest_nodes(G, lng, lat)
        reachable_nodes = nx.ego_graph(G, origin_node, radius=time_hours * 3600, distance='travel_time')
        print("Reachable nodes successfully calculated.")
    except Exception as e:
        print("Error calculating reachable nodes:", e)
        return jsonify({"error": "Reach calculation failed"}), 500

    # Converteer naar GeoJSON
    try:
        reachable_area = ox.graph_to_gdfs(reachable_nodes, nodes=False)
        geojson_data = json.loads(reachable_area.to_json())
        print("GeoJSON successfully created.")
        
    except Exception as e:
        print("Error converting to GeoJSON:", e)
        return jsonify({"error": "GeoJSON conversion failed"}), 500

    print("Returning GeoJSON data.")
    return jsonify(geojson_data)


# FUNCTIE 2 CALCULATE_ROUTE Bereken de kortste route tussen twee punten.
@app.route('/calculate_route', methods=['POST'])
def calculate_route():
    data = request.json
    start = data.get('start')
    end = data.get('end')
    mode = data.get('mode')

    if not start or not end or not mode:
        return jsonify({"error": "Invalid input parameters"}), 400

    try:
        # Laad de graaf vanuit OSM
        G = ox.graph_from_point(start, dist=5000, network_type='all')

        if mode == "walk":
            # Wandelaars kunnen overal komen behalve op snelwegen en trunk roads
            edges_to_remove = []
            for u, v, k, data in G.edges(keys=True, data=True):
                highway = data.get('highway')
                access = data.get('access', None)
                foot = data.get('foot', None)

                # Verwijder snelwegen, trunk roads of expliciet verboden voetwegen
                if (
                    highway in ['motorway', 'motorway_link', 'trunk', 'trunk_link'] or
                    access == 'no' or
                    foot == 'no'
                ):
                    edges_to_remove.append((u, v, k))

            G.remove_edges_from(edges_to_remove)

            # Voeg reistijd toe
            for u, v, k, data in G.edges(data=True, keys=True):
                data['speed_kph'] = 5  # Wandelsnelheid in km/h
                data['travel_time'] = (data['length'] / 1000) / data['speed_kph'] * 3600

        elif mode == "drive":
            # Auto's gebruiken wegen gebaseerd op maximumsnelheid en toegestane wegen
            G = ox.add_edge_speeds(G)  # Voeg snelheden toe
            G = ox.add_edge_travel_times(G)  # Voeg reistijd toe

            # Verwijder niet-relevante wegen voor auto's
            edges_to_remove = []
            for u, v, k, data in G.edges(keys=True, data=True):
                highway = data.get('highway')
                access = data.get('access', None)
                maxspeed = data.get('maxspeed', None)

                # Verwijder voetwegen, fietspaden en wegen zonder toegang
                if (
                    highway in ['footway', 'path', 'pedestrian', 'cycleway'] or
                    access == 'no' or
                    maxspeed is None  # Wegen zonder maximumsnelheid (bijv. ongeschikte paden)
                ):
                    edges_to_remove.append((u, v, k))

            G.remove_edges_from(edges_to_remove)

        elif mode == "bike":
            # Fietsers gebruiken cycleways, tracks en andere geschikte wegen
            edges_to_remove = []
            for u, v, k, data in G.edges(keys=True, data=True):
                highway = data.get('highway', None)
                access = data.get('access', None)
                bicycle = data.get('bicycle', None)

                # Verwijder wegen die niet geschikt zijn voor fietsen
                if (
                    # Wegen die expliciet verboden zijn voor fietsers
                    bicycle == 'no' or
                    access == 'no' or
                    # Wegen die te smal of niet bedoeld zijn voor fietsers
                    highway in ['footway', 'path', 'pedestrian'] or
                    # Wegen die uitsluitend bedoeld zijn voor snel verkeer
                    highway in ['motorway', 'motorway_link', 'trunk', 'trunk_link']
                ):
                    edges_to_remove.append((u, v, k))

            # Verwijder ongeschikte wegen
            G.remove_edges_from(edges_to_remove)

            # Voeg reistijd toe gebaseerd op een gemiddelde fietssnelheid
            for u, v, k, data in G.edges(data=True, keys=True):
                data['speed_kph'] = 15  # Gemiddelde fietssnelheid in km/h
                data['travel_time'] = (data['length'] / 1000) / data['speed_kph'] * 3600



        # Zoek de dichtstbijzijnde knopen voor start- en eindpunt
        orig_node = ox.distance.nearest_nodes(G, start[1], start[0])
        dest_node = ox.distance.nearest_nodes(G, end[1], end[0])

        # Bereken de kortste route
        route = nx.shortest_path(G, orig_node, dest_node, weight="travel_time")

        # Bouw een lijst van coördinaten op voor de route
        route_coords = []
        for u, v in zip(route[:-1], route[1:]):
            edge_data = G.get_edge_data(u, v, 0)
            if 'geometry' in edge_data:
                route_coords.extend(list(edge_data['geometry'].coords))
            else:
                route_coords.append((G.nodes[u]['x'], G.nodes[u]['y']))
                route_coords.append((G.nodes[v]['x'], G.nodes[v]['y']))

        # Verwijder dubbele coördinaten
        route_coords = [route_coords[i] for i in range(len(route_coords)) if i == 0 or route_coords[i] != route_coords[i - 1]]

        # Maak GeoJSON-object
        geojson_data = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": route_coords
                    },
                    "properties": {"mode": mode}
                }
            ]
        }

        return jsonify(geojson_data)

    except Exception as e:
        print(f"Error calculating route: {e}")
        return jsonify({"error": "Internal Server Error"}), 500

# FUNCTIE 3 BUFFERS MAKEN: Maak buffers op basis van reistijd.
@app.route('/calculate_time_buffer', methods=['POST'])
def calculate_time_buffer():
    data = request.get_json()
    lat = data.get('lat')
    lng = data.get('lng')
    mode = data.get('mode')
    times = data.get('times')  # tijden in minuten voor elke buffer

    # Converteer snelheid naar meters per minuut
    speed = {'walk': 5000 / 60, 'bike': 15000 / 60, 'drive': 50000 / 60}  # in meters per minuut
    G = ox.graph_from_point((lat, lng), dist=5000, network_type=mode)

    # Start node bepalen
    center_node = ox.distance.nearest_nodes(G, X=lng, Y=lat)
    
    buffers = []
    for time in times:
        travel_distance = speed[mode] * time  # Afstand in meters
        subgraph = nx.ego_graph(G, center_node, radius=travel_distance, distance='length')
        
        # Converteer subgraph naar geometrieën en maak een buffer om echte polygonen te krijgen
        nodes, edges = ox.graph_to_gdfs(subgraph, nodes=True, edges=True)
        polygon = edges.unary_union.buffer(50)  # Buffer om echte polygonen te creëren
        
        # Zorg ervoor dat het resultaat een MultiPolygon is, voor consistentie
        if isinstance(polygon, Polygon):
            polygon = MultiPolygon([polygon])

        # Converteer polygonen naar GeoJSON-achtige structuren
        buffers.append(polygon.__geo_interface__)

    return jsonify({"buffers": buffers})

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))  # Gebruik Render's poort of standaard 5000
    app.run(host="0.0.0.0", port=port)