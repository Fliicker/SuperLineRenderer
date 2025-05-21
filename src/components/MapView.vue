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

function encodeFloatToDouble(value: number) {
  let result = new Float32Array(2);
  result[0] = value;
  result[1] = value - result[0];
  return result;
}

console.log(encodeFloatToDouble(0.1));

onMounted(async () => {
  map = new mapboxgl.Map({
    container: "map-container",
    center: [118.800697, 32.064162], // starting position [lng, lat]
    zoom: 4,
    style: "mapbox://styles/mapbox/dark-v10", // style URL
  });

  let lineLayer = new SuperLineLayer();
  let startFlag = false;

  map.on("load", () => {
    map.addLayer(lineLayer);
  });

  map.on("click", (e: { lngLat: any }) => {
    const lngLat = e.lngLat;
    const mercatorCoords = mapboxgl.MercatorCoordinate.fromLngLat(lngLat);

    if (!startFlag) {
      lineLayer.updateCurrentPoint(mercatorCoords);
      startFlag = true;
    } else {
      lineLayer.confirmCurrentPoint();
    }
  });

  map.on("mousemove", (e: { lngLat: any }) => {
    if (!startFlag) return;

    const lngLat = e.lngLat;
    const mercatorCoords = mapboxgl.MercatorCoordinate.fromLngLat(lngLat);

    lineLayer.updateCurrentPoint(mercatorCoords);
  });
});
</script>

<style lang="scss">
#map-container {
  width: 100%;
  height: 100%;
}
</style>
