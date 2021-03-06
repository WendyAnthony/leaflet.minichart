// Copyright © 2016 RTE Réseau de transport d’électricité
(function() {
  var d3 = require("d3");
  var minicharts = require("minicharts");
  var utils = require("./utils.js");

  L.Minichart = L.CircleMarker.extend({
    /** Options used to initialize/update a Minichart object.
      * @typedef {object} MinichartOptions
      * @memberOf 'L.Minichart'
      * @prop {string} [type = "bar"]
      * Type of chart to create. Possible values are "bar" for barcharts, "pie"
      * for pie charts, "polar-radius" and "polar-area" for polar area charts
      * where values are represented either by the radius or the area of the
      * slices.
      * @prop {number[]} [data = [1]]
      * Data values the chart has to represent.
      * @prop {number[]|"auto"} [maxValues = "auto"]
      * maximal absolute value the data could take. It can be a single numeric
      * value or an array of values with same length as data. In the first case,
      * all values will be represented with the same scale while in the second
      * case, each value will have its own scale. This is useful when one wants
      * to represent multiple variables that are not comparable. If it equals to
      * "auto" (the default) then the maximum absolute value in data is used.
      * @prop {string[]} [colors=d3.schemeCategory10] Array of colors. If its
      * length is less than the length of data, colors are recycled.
      * @prop {number} [width=60]
      * Width of the chart when `type` equals 'bar' or maximal diameter of the
      * chart for all other types.
      * @prop {number} [height=60]
      * Maximal height of barcharts.
      * @prop {string[]|"none"|"auto"}[labels="none"]
      * Labels to display on the chart. If it equals to "auto" then data values
      * are displayed in a compact way.
      * @prop {number} [labelMinSize=8]
      * Labels are automatically hidden if the label height is less than this number.
      * @prop {number} [labelMaxSize=24]
      * Maximal height of labels in pixels.
      * @prop {number} [labelPadding=2]
      * Padding to apply to labels.
      * @prop {string} [labelStyle="font-family:sans-serif"]
      * CSS style to apply to labels
      * @prop {string} [labelColor="auto"]
      * Color to apply to labels. If "auto", text will be black or white
      * depending on the background color.
      * @prop {number} [transitionTime=750]
      * Duration in millisecondq of transitions.
      *
      */
    options: {
      type: "bar",
      data: [1],
      maxValue: "auto",
      colors: d3.schemeCategory10,
      width: 60,
      height: 60,
      opacity: 1,
      labels:"none",
      labelMinSize: 8,
      labelMaxSize: 24,
      labelPadding: 2,
      labelColor: "auto",
      labelStyle: "font-family:sans-serif",
      transitionTime: 750
    },

    /**
      * @class 'L.Minichart'
      * @summary add add bar, pie and polar charts to a leaflet map
      * @desc L.Minichart is used to add dynamic charts on a leaflet map. It is specially
      * useful to represent multiple data values associated to some geographical
      * coordinates.
      *
      * @example
      *
      * L.minichart([0, 0], {data: [1, 2, 3], maxValues: 3})
      *
      * @param {L.Point} center
      * @param {MinichartOptions} options - Object containing
      * options to construct a chart.
      */
    initialize: function(center, options) {
      this._center = center;
      this.options = utils.mergeOptions(options, this.options);
      L.CircleMarker.prototype.initialize.call(
        this,
        center,
        {radius: this.options.width/2, stroke: false, fill: false}
      );
    },

    onAdd: function(map) {
      L.CircleMarker.prototype.onAdd.call(this, map);
      // Change class of container so that the element hides when zooming
      var container = this._container || this._renderer._container;
      container.setAttribute("class", "leaflet-zoom-hide");

      // create the svg element that holds the chart
      this._chart = d3.select(container).append("g");

      map.on('viewreset', this._redraw, this);
      this._redraw(true);
    },

    onRemove: function() {
      // remove layer's DOM elements and listeners
      L.CircleMarker.prototype.onRemove.call(this, map);
      map.off('viewreset', this._redraw, this);
    },

    /** Update the options of a minichart object.
      * @method setOptions
      * @instance
      * @memberOf 'L.Minichart'
      *
      * @param {MinichartOptions} options - Object containing options to update the chart.
      */
    setOptions: function(options) {
      var newChart = options.type && options.type != this.options.type;
      this.options = utils.mergeOptions(options, this.options);
      this._redraw(newChart);
    },

    _redraw: function(newChart) {
      // Move container on the map
      var c = this._map.latLngToLayerPoint(this._center);
      this._chart
        .attr("transform", "translate(" + (c.x - this.options.width / 2) + "," + (c.y - this.options.height / 2) + ")")
        .transition()
        .duration(this.options.transitionTime)
        .attr("opacity", this.options.opacity);

      // prepare data
      var data = this.options.data;
      data = utils.toArray(data);
      for (var i = 0; i < data.length; i++) {
        if (isNaN(data[i]) || !isFinite(data[i])) data[i] = 0;
      }

      // Max absolute value for each variable
      var max = this.options.maxValues;
      if (max === "auto") {
        max = Math.max(
          d3.max(data),
          Math.abs(d3.min(data))
        )
      }
      max = utils.toArray(max);

      if(max.length !== 1 && max.length != data.length) {
        throw new Error("'maxValues' should be a single number or have same length as 'data'");
      }

      // Scale data. This step is essential to have different scales for each
      // variable. Only relevant if chart is not a pie/
      var dataScaled = [];

      if (this.options.type == "pie") {
        dataScaled = data;
      } else {
        for (var i = 0; i < data.length; i++) {
          dataScaled.push(data[i] / max[i % max.length]);
        }
      }

      // Prepare labels
      var labels = this.options.labels;
      if (labels === "auto") {
        labels = utils.prettyNumbers(data);
      } else if (labels != "none") {
        labelFun = utils.toFunction(labels);
        labels = function(d, i) {
          labelFun(data[i], i);
        }
      }

      // Generator function
      var generator, type;
      switch(this.options.type) {
        case "bar":
          generator = minicharts.Barchart;
          break;
        case "pie":
          generator = minicharts.Piechart;
          break;
        case "polar-radius":
          generator = minicharts.Polarchart;
          type = "radius";
          break;
        case "polar-area":
          generator = minicharts.Polarchart;
          type = "area";
          break;
      }

      // Graphical options for the generator function
      var chartOpts = {
        width: this.options.width,
        height: this.options.height * 2, // Used only if type = "bar"
        colors: this.options.colors,
        type: type,
        transitionTime: this.options.transitionTime,
        minValue: -1,
        maxValue:1,
        labels: labels,
        labelColors: this.options.labelColor,
        labelMinSize: this.options.labelMinSize,
        labelMaxSize: this.options.labelMaxSize,
        labelPadding: this.options.labelPadding,
        labelClass: "leaflet-clickable",
        shapeClass: "leaflet-clickable"
      };

      // Create of update chart
      if (newChart === true) {
        this._chart.selectAll("*").remove();
        this._chartObject = new generator(this._chart.node(), dataScaled, chartOpts);
      } else {
        this._chartObject.update(dataScaled, chartOpts);
      }
    }
  });

  L.minichart = function(center, options) {
  return new L.Minichart(center, options);
};
})();
