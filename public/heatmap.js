import "/d3.js"
import "/plot.js"

async function createVisualization() {
  let res = await fetch("./traffic.csv")
  let csv = await res.text()

  const traffic = d3.csvParse(csv, d => ({
    location: d.location,
    date: new Date(d.date), // Convert to proper Date object
    vehicles: +d.vehicles // Convert to number
  }));

  console.log("Parsed traffic data:", traffic.slice(0, 5));
  console.log("Traffic data loaded:", traffic.length, "rows");

  const plot = Plot.plot({
    padding: 0,
    x: {label: null, tickFormat: "", axis: null},
    y: {label: null, tickFormat: "", axis: null},
    color: {legend: false, zero: true},
    marks: [
      Plot.cell(
        traffic,
        Plot.group(
          {fill: "median"},
          {x: (d) => d.date.getUTCHours(), y: "location", fill: "vehicles", inset: 0.5, sort: {y: "fill"}}
        )
      )
    ]
  });

  const div = document.querySelector("#myplot");
  div.append(plot);
}

createVisualization().catch(error => {
  console.error("Error creating visualization:", error);
});
