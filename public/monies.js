//<script src="d3.js"></script>
//<script src="plot.js"></script>
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

  console.log("Parsed traffic data:", traffic.slice(0, 5)); // Log first 5 rows
  console.log("Traffic data loaded:", traffic.length, "rows");

  const plot = Plot.plot({
    marginLeft: 120,
    padding: 0,
    y: {label: null},
    color: {legend: true, zero: true},
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
  if (div) {
    div.append(plot);
  } else {
    console.error("Could not find element with id 'myplot'");
  }
}

// Execute the visualization
createVisualization().catch(error => {
  console.error("Error creating visualization:", error);
});
