//<script src="d3.js"></script>
//<script src="plot.js"></script>
import "/d3.js"
import "/plot.js"

// const plot = Plot.rectY(
//   {length: 100}, 
//   Plot.binX(
//     {y: "count"}, 
//     {x: Math.random}
//   )
// ).plot();
//



// traffic = FileAttachment("traffic.csv").csv({typed: true})
async function retrieve(){
  let res = await fetch("./traffic.csv")
  let csv = await res.text()
  // console.log(csv)
  console.log(typeof(csv))
  return csv
}
const csv = retrieve()

const traffic = d3.csvParse(csv);

console.log(traffic)




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
})

const div = document.querySelector("#myplot");
div.append(plot);
