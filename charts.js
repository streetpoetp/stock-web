"use strict";

(function () {
  const COLORS = {
    text: "#b9cce0",
    grid: "#1c3045",
    red: "#ff5d62",
    green: "#29c979",
    dif: "#f1c84b",
    dea: "#45a3ff",
    wedge: "rgba(172, 74, 92, .24)",
  };

  function macdBarColor(value) {
    return Number(value) >= 0 ? COLORS.red : COLORS.green;
  }

  function wedgeRange(candidate, points) {
    if (!candidate || !Array.isArray(points) || !points.length) return null;
    const windowLength = Number(candidate.window_length);
    if (!Number.isInteger(windowLength) || windowLength <= 0) return null;
    const last = points.length - 1;
    const histogram = points.map((point) => Number(point.histogram));
    let end = null;

    if (candidate.state === "APPROACHING") {
      if (!(histogram[last] < 0)) return null;
      end = last;
    } else if (candidate.state === "TURNING") {
      if (last < 1 || !(histogram[last - 1] < 0 && histogram[last] >= 0)) {
        return null;
      }
      end = last - 1;
    } else if (candidate.state === "JUST_TURNED") {
      for (
        let cross = last;
        cross >= Math.max(1, last - 2);
        cross -= 1
      ) {
        if (histogram[cross - 1] < 0 && histogram[cross] >= 0) {
          end = cross - 1;
          break;
        }
      }
      if (end == null) return null;
    } else {
      return null;
    }

    const start = end - windowLength + 1;
    if (start < 0) return null;
    return {startIndex: start, endIndex: end};
  }

  function baseAxis() {
    return {
      axisLine: {lineStyle: {color: "#31475d"}},
      axisTick: {show: false},
      axisLabel: {color: COLORS.text, fontSize: 10},
      splitLine: {lineStyle: {color: COLORS.grid}},
    };
  }

  function priceOption(history) {
    const dates = history.map((bar) => bar.trade_date);
    const candles = history.map((bar) => [
      Number(bar.open),
      Number(bar.close),
      Number(bar.low),
      Number(bar.high),
    ]);
    const volume = history.map((bar) => ({
      value: Number(bar.volume),
      itemStyle: {
        color: Number(bar.close) >= Number(bar.open) ? COLORS.red : COLORS.green,
        opacity: .72,
      },
    }));
    return {
      animation: false,
      backgroundColor: "transparent",
      textStyle: {color: COLORS.text},
      tooltip: {trigger: "axis", axisPointer: {type: "cross"}},
      axisPointer: {link: [{xAxisIndex: "all"}]},
      grid: [
        {left: 58, right: 18, top: 28, height: "60%"},
        {left: 58, right: 18, top: "76%", height: "15%"},
      ],
      xAxis: [
        Object.assign(baseAxis(), {
          type: "category",
          data: dates,
          boundaryGap: true,
          axisLabel: {show: false},
          gridIndex: 0,
        }),
        Object.assign(baseAxis(), {
          type: "category",
          data: dates,
          boundaryGap: true,
          gridIndex: 1,
          axisLabel: {color: COLORS.text, fontSize: 9},
        }),
      ],
      yAxis: [
        Object.assign(baseAxis(), {
          scale: true,
          gridIndex: 0,
          name: "Price",
          nameTextStyle: {color: COLORS.text},
        }),
        Object.assign(baseAxis(), {
          scale: true,
          gridIndex: 1,
          name: "Vol",
          nameTextStyle: {color: COLORS.text},
          axisLabel: {show: false},
        }),
      ],
      dataZoom: [
        {type: "inside", xAxisIndex: [0, 1], start: 45, end: 100},
      ],
      series: [
        {
          name: "Price",
          type: "candlestick",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: candles,
          itemStyle: {
            color: COLORS.red,
            color0: COLORS.green,
            borderColor: COLORS.red,
            borderColor0: COLORS.green,
          },
        },
        {
          name: "Volume",
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: volume,
          barMaxWidth: 8,
        },
      ],
    };
  }

  function macdOption(history, points, candidate) {
    const dates = history.map((bar) => bar.trade_date);
    const range = wedgeRange(candidate, points);
    const histogramSeries = {
      name: "Histogram",
      type: "bar",
      data: points.map((point) => ({
        value: Number(point.histogram),
        itemStyle: {color: macdBarColor(point.histogram)},
      })),
      barMaxWidth: 8,
    };
    if (range) {
      histogramSeries.markArea = {
        silent: true,
        itemStyle: {color: COLORS.wedge},
        label: {
          show: true,
          color: "#ffd7de",
          formatter: "Wedge (" + Number(candidate.window_length) + " bars)",
          position: "insideTop",
        },
        data: [[
          {xAxis: dates[range.startIndex]},
          {xAxis: dates[range.endIndex]},
        ]],
      };
    }
    return {
      animation: false,
      backgroundColor: "transparent",
      textStyle: {color: COLORS.text},
      tooltip: {trigger: "axis"},
      legend: {
        right: 12,
        top: 2,
        textStyle: {color: COLORS.text},
        data: ["DIF", "DEA", "Histogram"],
      },
      grid: {left: 58, right: 18, top: 36, bottom: 42},
      xAxis: Object.assign(baseAxis(), {
        type: "category",
        data: dates,
        boundaryGap: true,
        axisLabel: {color: COLORS.text, fontSize: 9},
      }),
      yAxis: Object.assign(baseAxis(), {scale: true}),
      dataZoom: [
        {type: "inside", start: 45, end: 100},
      ],
      series: [
        {
          name: "DIF",
          type: "line",
          data: points.map((point) => Number(point.dif)),
          showSymbol: false,
          lineStyle: {color: COLORS.dif, width: 1.5},
          itemStyle: {color: COLORS.dif},
        },
        {
          name: "DEA",
          type: "line",
          data: points.map((point) => Number(point.dea)),
          showSymbol: false,
          lineStyle: {color: COLORS.dea, width: 1.5, type: "dashed"},
          itemStyle: {color: COLORS.dea},
        },
        histogramSeries,
      ],
    };
  }

  function dispose(element) {
    if (
      element &&
      window.echarts &&
      typeof window.echarts.getInstanceByDom === "function"
    ) {
      const instance = window.echarts.getInstanceByDom(element);
      if (instance) instance.dispose();
    }
  }

  function render(priceElement, macdElement, history, points, candidate) {
    if (!window.echarts || typeof window.echarts.init !== "function") {
      throw new Error("ECharts is not loaded");
    }
    dispose(priceElement);
    dispose(macdElement);
    const price = window.echarts.init(priceElement, null, {renderer: "canvas"});
    const macd = window.echarts.init(macdElement, null, {renderer: "canvas"});
    price.setOption(priceOption(history));
    macd.setOption(macdOption(history, points, candidate));
    return {
      price,
      macd,
      dispose() {
        price.dispose();
        macd.dispose();
      },
    };
  }

  window.StockCharts = {
    colors: COLORS,
    macdBarColor,
    wedgeRange,
    priceOption,
    macdOption,
    render,
    dispose,
  };
}());
