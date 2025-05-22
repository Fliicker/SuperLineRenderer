<template>
  <div id="map-container" ref="mapContainer"></div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import mapboxgl from "mapbox-gl";
import SuperLineLayer from "@/js/SuperLineLayer";

mapboxgl.accessToken =
  "pk.eyJ1IjoiZmxpY2tlcjA1NiIsImEiOiJjbGd4OXM1c3cwOWs3M21ta2RiMDhoczVnIn0.lE8NriBf_g3RZWCusw_mZA";

const mapContainer = ref(null);
let map;

onMounted(async () => {
  map = new mapboxgl.Map({
    container: "map-container",
    center: [118.800697, 32.064162], // starting position [lng, lat]
    zoom: 4,
    style: "mapbox://styles/mapbox/dark-v10", // style URL
  });

  let lineLayer = new SuperLineLayer();
  let startFlag = false;

  map.doubleClickZoom.disable()
  
  map.on("load", () => {
    map.addLayer(lineLayer);
  });

  map.on("click", (e: { lngLat: any }) => {
    const lngLat = e.lngLat;
    const mercatorCoords = mapboxgl.MercatorCoordinate.fromLngLat(lngLat);

    if (!startFlag) {
      lineLayer.clearPoints();
      lineLayer.updateCurrentPoint(mercatorCoords);
      startFlag = true;
    }
    
    lineLayer.confirmCurrentPoint();
    // lineLayer.updateCurrentPoint(mercatorCoords);
  });

  map.on("mousemove", (e: { lngLat: any }) => {
    if (!startFlag) return;

    const lngLat = e.lngLat;
    const mercatorCoords = mapboxgl.MercatorCoordinate.fromLngLat(lngLat);

    lineLayer.updateCurrentPoint(mercatorCoords);
  });

  map.on("dblclick", (e: { lngLat: any }) => {
    if (!startFlag) return;

    lineLayer.confirmCurrentPoint();
    startFlag = false;
  });
});
</script>

<style lang="scss">
#map-container {
  width: 100%;
  height: 100%;
}
</style>
