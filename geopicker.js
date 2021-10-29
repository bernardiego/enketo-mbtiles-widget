/*
 * Diego Bernardi <bernardiego@gmail.com>
 * Antea Group.
 */

import Geopicker from '../../node_modules/enketo-core/src/widget/geo/geopicker';
import { getCurrentPosition } from '../../node_modules/enketo-core/src/js/geolocation';
import $ from 'jquery';
import L from 'leaflet';
import scriptjs from 'scriptjs';

const isUndefined = (attribute) => typeof attribute === "undefined";
const isNumber = (attribute) => typeof attribute === "number";
const isFunction = (attribute) => typeof attribute === "function";
const isString = (attribute) => typeof attribute === "string";
const isPureObject = (attribute) => typeof attribute === "object" && attribute !== null && !Array.isArray(attribute);

// Make your custom config file.
import { custom_options } from './config';
const options = custom_options || {};
const maxZoom = options && options.map && isNumber(options.map.maxZoom) ? options.map.maxZoom : 24;
const markerColor = options && options.map && isString(options.map.markerColor) ? options.map.markerColor : "blue";
const markerSize = options && options.map && options.map.markerSize === "big" ? options.map.markerSize : "small";
const mbtilesPath = options && isString(options.mbtilesPath) && options.mbtilesPath !== "" ? options.mbtilesPath : undefined;

export default class GeopickerMbTiles extends Geopicker {

   __getQuestionId() {
      var formId = $('form').attr("id") || $('form').attr("data-form-id");
      return $(this.question).find("input[name*='" + formId + "']").prop("name");
   }

   __getIcon() {
      let self = this;
      const posible_colors = ["black", "blue", "gold", "green", "grey", "orange", "red", "violet", "yellow"];
      const color = isString(markerColor) && posible_colors.indexOf(markerColor) > -1 ? markerColor : "blue";
      const size = markerSize === "big" ? "-2x" : "";

      if (isPureObject(self.markerIcon) && self.markerIcon.color === color && self.markerIcon.icon instanceof L.Icon)
         return self.markerIcon.icon;

      self.markerIcon = {
         color: color,
         icon: new L.Icon({
            iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon${size}-${color}.png`,
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: size === "" ? [18, 30] : [25, 41],
            iconAnchor: size === "" ? [9, 30] : [12, 41],
            popupAnchor: size === "" ? [1, -24] : [1, -34],
            shadowSize: size === "" ? [30, 30] : [41, 41]
         })
      }

      return self.markerIcon.icon;
   }

   __onMapReady() {
      let self = this;
      return new Promise(async (resolve) => {
         while (isUndefined(self.map))
            await new Promise(r => setTimeout(r, 500));
         resolve();
      });
   }

   __hasValidPoint() {
      return this.points[0].length === 4 && isNumber(this.points[0][0]) && isNumber(this.points[0][1]);
   }

   __getPoint() {
      let self = this;
      return new Promise(async (resolve) => {
         let stop = 100;
         const step = 100;
         while (!self.__hasValidPoint() && stop > 0) {
            stop -= step;
            await new Promise(r => setTimeout(r, step));
         }
         if (!self.__hasValidPoint())
            return resolve(undefined);

         resolve(
            L.featureGroup([
               L.marker([self.points[0][0], self.points[0][1]], {
                  clickable: false,
                  draggable: false,
                  keyboard: false,
                  opacity: 0
               })
            ])
         );
      });
   }

   __onPointAddition(callback = undefined) {
      let self = this;
      if (!isFunction(callback))
         return;
      new MutationObserver(
         callback
      ).observe(
         self.$widget.find(".leaflet-marker-pane")[0],
         {
            childList: true
         }
      );
   }

   __changeMarkerIcon() {
      let self = this;
      let icon = self.__getIcon();
      if (isPureObject(self.markerLayer))
         self.markerLayer.eachLayer(l => {
            l.setIcon(icon);
         });
   }

   __adaptiveZoom() {
      let self = this;
      return new Promise(async (resolve) => {
         let maxZ = maxZoom;
         let mbtilesBound = undefined;
         if (self.map.hasLayer(self.mbLayer)) {
            mbtilesBound = self.mbLayer._bounds;
            if (isPureObject(self.mbLayer.options) && isNumber(self.mbLayer.options.maxZoom))
               maxZ = self.mbLayer.options.maxZoom;
         }
         self.map.setMaxZoom(maxZ);
         let lPoint = await self.__getPoint();
         let point_coords = $(self.question).find(".pointcoords");
         point_coords.html("");
         if (isPureObject(lPoint)) {
            self.map.fitBounds(lPoint.getBounds());
            point_coords.html(`Lat: ${self.points[0][0].toFixed(6)}&deg;, Lon: ${self.points[0][1].toFixed(6)}&deg; ${isNumber(self.points[0][3]) ? "(" + self.points[0][3].toFixed(3) + "m)" : ""}`);
            return resolve();
         } else if (!isUndefined(mbtilesBound)) {
            let north = self.mbLayer._bounds.getNorth();
            if (north !== -Infinity && north !== Infinity)
               self.map.fitBounds(self.mbLayer._bounds, { paddingTopLeft: [5, 5], paddingBottomRight: [5, 5], animate: false });
            return resolve();
         } else if (isPureObject(self.currentPositionPoint))
            self.map.fitBounds(self.currentPositionPoint.getBounds());
         resolve();
      });
   }

   __AddCurrentPositionMarker() {
      var self = this;
      getCurrentPosition({
         enableHighAccuracy: true,
         maximumAge: 0
      }).then(result => {
         let { latitude, longitude, altitude, accuracy } = result.position.coords;
         let latLng = [latitude, longitude, altitude, accuracy];
         if (self._isValidLatLng(latLng)) {
            self.currentPositionPoint = L.featureGroup([
               L.marker(self._cleanLatLng(latLng), {
                  icon: L.divIcon({
                     iconSize: 14,
                     className: 'red-round-geopoint-marker'
                  }),
                  title: "my position",
                  clickable: false,
                  draggable: false,
                  keyboard: false,
                  opacity: 0.9
               })
            ]);
            self.currentPositionPoint.addTo(self.map);
            self.map.fitBounds(self.currentPositionPoint.getBounds());
         }
      }).catch(() => {
         console.error('error occurred trying to obtain position');
      });
   }

   __removeMBLayer() {
      var self = this;
      if (isUndefined(self.map) || isUndefined(self.mbLayer))
         return;

      if (self.map.hasLayer(self.mbLayer)) {
         self.map.removeLayer(self.mbLayer);
         self.mbLayer = undefined;
      }
      var tx = self.db.transaction("mbtiles", "readwrite");
      var store = tx.objectStore("mbtiles");

      store.delete(self.idQuestion);
   }

   __fitMbtilesBounds(force = false) {
      let self = this;
      if (isUndefined(self.map)) {
         console.warn("function fitBounds: map is undefined");
         return;
      }
      if (isUndefined(self.mbLayer)) {
         console.warn("function fitBounds: layer is undefined.");
         return;
      }
      if (isUndefined(self.mbLayer._bounds)) {
         if (!self.map.hasLayer(self.mbLayer)) {
            console.warn("function fitBounds: layer is not loaded in the map.");
            return;
         }
         if (isUndefined(self.mbLayer._db)) {
            console.warn("function fitBounds: layer' database isn't loaded yet (called on databaseloaded?).");
            return;
         }
         let boundsStr = self.mbLayer._db
            .prepare(`SELECT value FROM metadata WHERE name = 'bounds'`)
            .getAsObject({})
            .value;
         if (isUndefined(boundsStr)) {
            console.warn("function fitBounds: mbtiles files doesn't contain a 'bounds' metadata.");
            return;
         }

         let boundsArr = boundsStr.split(",");
         if (boundsArr.length !== 4) {
            console.warn(`function fitBounds: 'bounds' metadata is badly formatted: ${boundsStr}`);
            return;
         }

         self.mbLayer._bounds = L.latLngBounds(
            L.latLng(boundsArr[1], boundsArr[0]),
            L.latLng(boundsArr[3], boundsArr[2])
         );
      }
      if (!isUndefined(self.mbLayer._bounds)) {
         let north = self.mbLayer._bounds.getNorth();
         if (north !== -Infinity && north !== Infinity && (!self.__hasValidPoint() || force))
            self.map.fitBounds(self.mbLayer._bounds, { paddingTopLeft: [5, 5], paddingBottomRight: [5, 5], animate: false });
      }
   }

   __addMbTiles(files) {
      let self = this;
      self.__onMapReady().then(() => {
         self.__removeMBLayer();
         let tmppath = URL.createObjectURL(files[0]);
         self.mbLayer = L.tileLayer.mbTiles(tmppath).addTo(self.map);
         self.mbLayer.bringToFront();
         self.mbLayer.on('databaseloaded', (ev) => {
            var tx = self.db.transaction("mbtiles", "readwrite");
            var store = tx.objectStore("mbtiles");
            store.put({ path: files, mbId: self.idQuestion });
            tx.oncomplete = () => {
               self.__fitMbtilesBounds();
               $(self.question).find('.loader').css('display', "none");
            };
         });
         self.mbLayer.on('databaseerror', (ev) => {
            console.info('MBTiles DB error', ev);
            $(self.question).find('.loader').css('display', "none");
         });
      });
   }

   __initContent() {
      var self = this;
      $(self.question).find(".input-group").append($("<div class='pointcoords'></div>"));

      let mbtilesdiv = $("<div class='mbtilesdiv'></div>");
      let path = $("<div class='mbtilespath'></div>");
      if (isString(mbtilesPath)) {
         path.html(mbtilesPath)
         mbtilesdiv.attr("style", "padding-top: 23px;");
         path.attr("style", "display: flex;");
      }
      mbtilesdiv.append(path);

      let filechooser = $("<input type='file' accept='.mbtiles' name='mbtiles'/>");
      filechooser.on('change', (event) => {
         if (event.target.files.length === 1) {
            $(self.question).find('.loader').css('display', "block");
            self.__addMbTiles(event.target.files);
         }
      })
      mbtilesdiv.append(filechooser);

      let toBound = $("<button class='fa fa-expand'></button>");
      toBound.on("click", () => self.__fitMbtilesBounds(true));
      mbtilesdiv.append(toBound);

      let trash = $("<button class='fa fa-trash'></button>");
      trash.on("click", async () => {
         self.__removeMBLayer();
         filechooser.val("");
         self.__adaptiveZoom();
      });
      mbtilesdiv.append(trash);

      $(self.question).find("div.map-canvas-wrapper").append(mbtilesdiv);
   }

   __onLibIsLoad() {
      var self = this;
      self.idQuestion = self.__getQuestionId();
      $(self.question).find(".map-canvas").append("<div class='loader'></div>");

      var request = window.indexedDB.open("enketoMbtiles", 2);
      request.onupgradeneeded = (e) => {
         self.db = e.target.result;
         self.db.objectStoreNames.contains("mbtiles") || self.db.createObjectStore("mbtiles", { keyPath: "mbId" });
      };
      request.onsuccess = () => {
         self.db = request.result;
      };

      // Initialization of the widget
      self.__initContent();

      // Actions to perform once the map is loaded.        
      self.__onMapReady().then(() => {
         self.__AddCurrentPositionMarker();
         self.__onPointAddition(async (records) => {
            records.forEach(record => {
               if (record.addedNodes.length > 0)
                  self.__changeMarkerIcon();
            });
            await self.__adaptiveZoom();
         });
      })
   }

   _init() {
      super._init();
      var self = this;
      if (isUndefined(window.geopicker))
         window.geopicker = [];
      window.geopicker.push(this);
      if (self._getProps().appearances.includes("mbtiles") && $(self.question).find(".map-canvas")) {
         Promise.all([
            scriptjs('https://unpkg.com/sql.js@0.3.2/js/sql.js'),
            scriptjs('https://unpkg.com/Leaflet.TileLayer.MBTiles@1.0.0/Leaflet.TileLayer.MBTiles.js')
         ]).then(() => self.__onLibIsLoad());
      }
   }
}
