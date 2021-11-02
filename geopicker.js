/*
 * Diego Bernardi <bernardiego@gmail.com> - GeoAgro by Tek.
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
const isBoolean = (attribute) => typeof attribute === "boolean";
const isString = (attribute) => typeof attribute === "string";
const isPureObject = (attribute) => typeof attribute === "object" && attribute !== null && !Array.isArray(attribute);

export default class GeopickerMbTiles extends Geopicker {

   /**
    * Gets and parses the "appearance" string (as JSON) and creates a custom options object.
    * This object could be different for every question, making it flexible.
    */
   __initOptions() {
      let self = this;
      let appearances = self._getProps().appearances;
      self.customOpts = {};
      if (appearances.length > 0 && isString(appearances[0])) {
         let opts = undefined;
         try {
            opts = JSON.parse(appearances[0]);
         } catch (err) {
            console.log("Couldn't parse appearances. Either is not a JSON string or has errors.");
         }
         if (isPureObject(opts)) {
            let keys = Object.keys(opts);
            for (let i = 0; i < keys.length; i++)
               self.customOpts[keys[i]] = opts[keys[i]];
         }
      }
      if (!isBoolean(self.customOpts.mbtiles))
         self.customOpts.mbtiles = false;
      if (!isString(self.customOpts.mode) || self.customOpts.mode === "")
         self.customOpts.mode = "normal";
      if (!isString(self.customOpts.mbtilespath) || self.customOpts.mbtilespath === "")
         self.customOpts.mbtilespath = undefined;
      else if (self.customOpts.mbtilespath.indexOf(":") === -1)
         self.customOpts.mbtilespath = `Suggested path: ${self.customOpts.mbtilespath}`;
      if (!isNumber(self.customOpts.maxzoom) || self.customOpts.maxzoom <= 0 || self.customOpts.maxzoom > 24)
         self.customOpts.maxzoom = 24;
      if (!isString(self.customOpts.markercolor))
         self.customOpts.markercolor = "blue";
      if (self.customOpts.markersize !== "big")
         self.customOpts.markersize = "small";
   }

   /**
    * Gets the "id" of this geo* question.
    *
    * @return {string} The geo* question id.
    */
   __getQuestionId() {
      let formId = $('form').attr("id") || $('form').attr("data-form-id");
      return $(this.question).find("input[name*='" + formId + "']").prop("name");
   }

   /**
    * Obtains a personalized icon marker for the added point.
    * The icon can be personalized through the custom options object.
    * Once created, the icon is cached inside this geo* question.
    * 
    * @return {L.Icon} The created leaflet icon.
    */
   __getIcon() {
      let self = this;
      const posible_colors = ["black", "blue", "gold", "green", "grey", "orange", "red", "violet", "yellow"];
      const color = isString(self.customOpts.markercolor) && posible_colors.indexOf(self.customOpts.markercolor) > -1 ? self.customOpts.markercolor : "blue";
      const size = self.customOpts.markersize === "big" ? "-2x" : "";

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

   /**
    * Useful funtion to check when the map object is created,
    * so we can perform actions after that.
    *
    * @return {Promise} When the map is created.
    */
   __onMapReady() {
      let self = this;
      return new Promise(async (resolve) => {
         while (isUndefined(self.map))
            await new Promise(r => setTimeout(r, 500));
         resolve();
      });
   }

   /**
    * Check if the selected point in the map is valid.
    *
    * @return {boolean} Whether geopoint is valid.
    */
   __hasValidPoint() {
      return this.points[0].length === 4 && isNumber(this.points[0][0]) && isNumber(this.points[0][1]);
   }

   /**
    * Creates an invisible Leaflet marker with the selected point (if there is one)
    * so we can obtain its bounds later.
    *
    * @return {Promise<L.FeatureGroup|undefined>} The Leaflet marker or undefined.
    */
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

   /**
    * Sets an observer to watch for new points added to the map in the widget.
    * This allow us to bypass the capture of every single point-adition' action
    * (KML, update inputs directly, click on map, click on georeference button, etc)
    * and make the customizations for every one of them with one function.
    *
    * @param {Function|undefined} callback - Asynchronous function to perform every time
    * a child of Node ".leaflet-marker-pane" is modified.
    * @return {undefined} undefined;
    */
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

   /**
    * Updates the marker icon for the added point. This icon' style is customizable.
    *
    * @return {undefined} undefined.
    */
   __changeMarkerIcon() {
      let self = this;
      let icon = self.__getIcon();
      if (isPureObject(self.markerLayer))
         self.markerLayer.eachLayer(l => {
            l.setIcon(icon);
         });
   }

   /**
    * This allows our map to zoom to a relevant element every time an mbtile
    * or a point is added/removed from it. It uses a chain of priorities to make zoom:
    * 1) Zooms to point added.
    * 2) If there's no point added, zooms to mbtiles layer.
    * 3) If there's no mbtiles layer, zooms to current position' point.
    * 4) If there's no current position' point, zooms to the world.
    *
    * @return {Promise<undefined>} undefined.
    */
   __adaptiveZoom() {
      let self = this;
      return new Promise(async (resolve) => {
         let maxZ = self.customOpts.maxzoom;
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

   /**
    * Gets the GPS current position and creates a read-only non-valid-as-a-respose Leaflet marker.
    * Then, we add it to the map and zoom to it.
    *
    * @return {undefined} undefined.
    */
   __AddCurrentPositionMarker() {
      let self = this;
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

   /**
    * A useful function to add personalized behaviour to the map.
    * The parameter "mode" is obteained from the "appearances" json object (custom options).
    *
    * @return {undefined} undefined.
    */
   __setMode() {
      let self = this;
      switch (self.customOpts.mode) {
         case "fixed":
            if (isPureObject(self.map)) {
               self.$detect.trigger("click");
               self.map.eachLayer(l => l.off("click"));
               self.map.off("click");
               self.$detect
                  .attr("style", "cursor: not-allowed")
                  .off("click");
            }
            self.$inputGroup.find("> .geo input")
               .attr("disabled", "disabled");
            break;
         default:
            break;
      }
   }

   /**
    * Deletes an mbtiles layer from the map and from the temporal database.
    *
    * @return {undefined} undefined.
    */
   __removeMBLayer() {
      let self = this;
      if (isUndefined(self.map) || isUndefined(self.mbLayer))
         return;

      if (self.map.hasLayer(self.mbLayer)) {
         self.map.removeLayer(self.mbLayer);
         self.mbLayer = undefined;
      }
      let tx = self.db.transaction("mbtiles", "readwrite");
      let store = tx.objectStore("mbtiles");
      store.delete(self.idQuestion);
   }

   /**
    * Tries to open the loaded mbtiles store object and obtain its "bounds" metadata attribute.
    * If successful, we create a bound, so we can zoom to the added layer.
    * The created bound object is cached into the mbtiles leaflet layer.
    *
    * @param {boolean} force - Whether to force the zoom to this layer.
    * @return {undefined} undefined
    */
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

   /**
    * Adds an mbtiles layer to the map and to the temporal database.
    * After, we zoom to it if possible.
    *
    * @param {Array<File>} files - Array with the mbtiles file/s selected by the user from the
    * local disk.
    * @return {undefined} undefined.
    */
   __addMbTiles(files) {
      let self = this;
      self.__onMapReady().then(() => {
         self.__removeMBLayer();
         let tmppath = URL.createObjectURL(files[0]);
         self.mbLayer = L.tileLayer.mbTiles(tmppath).addTo(self.map);
         self.mbLayer.bringToFront();
         self.mbLayer.on('databaseloaded', (ev) => {
            let tx = self.db.transaction("mbtiles", "readwrite");
            let store = tx.objectStore("mbtiles");
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

   /**
    * Update this question' html adding necessary elements: 
    * 1) Input for mbtile selection,
    * 2) Button "zoom to mbtile layer"
    * 3) Button "delete mbtiles layer".
    * 4) A hidden container to allocate the added point' coordinates.
    *
    * @return {undefined} undefined.
    */
   __initContent() {
      let self = this;
      $(self.question).find(".input-group").append($("<div class='pointcoords'></div>"));

      let mbtilesdiv = $("<div class='mbtilesdiv'></div>");
      let path = $("<div class='mbtilespath'></div>");
      if (isString(self.customOpts.mbtilespath)) {
         path.html(self.customOpts.mbtilespath)
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

   /**
    * Performs some actions once the necessary js libraries are loaded.
    *
    * @return {undefined} undefined.
    */
   __onLibIsLoad() {
      let self = this;
      self.idQuestion = self.__getQuestionId();
      $(self.question).find(".map-canvas").append("<div class='loader'></div>");

      let request = window.indexedDB.open("enketoMbtiles", 2);
      request.onupgradeneeded = (e) => {
         self.db = e.target.result;
         self.db.objectStoreNames.contains("mbtiles") || self.db.createObjectStore("mbtiles", { keyPath: "mbId" });
      };
      request.onsuccess = () => {
         self.db = request.result;
      };

      self.__initContent();

      self.__onMapReady().then(() => {
         self.__AddCurrentPositionMarker();
         self.__onPointAddition(async (records) => {
            records.forEach(record => {
               if (record.addedNodes.length > 0)
                  self.__changeMarkerIcon();
            });
            await self.__adaptiveZoom();
         });
         self.__setMode();
      })
   }

   _init() {
      super._init();
      let self = this;
      if (isUndefined(window.geopicker))
         window.geopicker = [];
      window.geopicker.push(this);
      self.__initOptions();
      if (self.customOpts.mbtiles === true && $(self.question).find(".map-canvas")) {
         Promise.all([
            scriptjs('https://unpkg.com/sql.js@0.3.2/js/sql.js'),
            scriptjs('https://unpkg.com/Leaflet.TileLayer.MBTiles@1.0.0/Leaflet.TileLayer.MBTiles.js')
         ]).then(() => self.__onLibIsLoad());
      }
   }
}
