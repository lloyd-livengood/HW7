import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

let sortByPerCapita = false;
let statePopulations = {};
let cachedData2023 = [];

Promise.all([
    d3.csv("accident.csv"),
    d3.csv("population.csv")
]).then(([accidentData, popData]) => {
    // Build population lookup
    popData.filter(d => d.SUMLEV === "040").forEach(d => {
        statePopulations[d.NAME] = +d.POPESTIMATE2023;
    });

    // Filter 2023 data
    cachedData2023 = accidentData.filter(d => d.YEAR === "2023" || d.YEAR === 2023);

    drawInteractiveChart(cachedData2023);
    
}).catch(error => {
    console.error("Error loading data:", error);
});

function drawInteractiveChart(data) {
    // Group and aggregate fatality data by state
    let fatalitiesByState = d3.rollups(
        data,
        v => d3.sum(v, d => +d.FATALS || 0),
        d => d.STATENAME
    );
    
    // Apply per capita calculation if toggled
    if (sortByPerCapita) {
        fatalitiesByState = fatalitiesByState.map(([state, total]) => {
            const pop = statePopulations[state] || 1;
            return [state, (total / pop) * 100000];
        });
    }
    
    // Sort by value descending
    fatalitiesByState.sort((a, b) => d3.descending(a[1], b[1]));
    
    // Validate data
    const badData = fatalitiesByState.filter(([state, value]) => !isFinite(value));
    if (badData.length > 0) {
        console.error("Bad data found:", badData);
        return;
    }
    
    // Bar chart
    const svg = d3.select("#bar-chart");
    svg.selectAll("*").remove();
    
    // Create interactive bar chart
    const width = 600, height = 300, margin = {top: 20, right: 20, bottom: 80, left: 50};
    
    const x = d3.scaleBand()
        .domain(fatalitiesByState.map(d => d[0]))
        .range([margin.left, width - margin.right])
        .padding(0.1);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(fatalitiesByState, d => d[1])])
        .nice()
        .range([height - margin.bottom, margin.top]);
    
    // Draw bars with transitions
    const bars = svg.selectAll(".bar-rect")
        .data(fatalitiesByState, d => d[0]); // Use key function for data binding
    
    // Handle exiting bars
    bars.exit()
        .transition()
        .duration(1000)
        .attr("y", y(0))
        .attr("height", 0)
        .remove();
    
    // Handle updating bars
    bars.transition()
        .duration(1000)
        .attr("x", d => x(d[0]))
        .attr("y", d => y(d[1]))
        .attr("width", x.bandwidth())
        .attr("height", d => y(0) - y(d[1]));
    
    // Handle entering bars
    bars.enter()
        .append("rect")
        .attr("class", "bar-rect")
        .attr("x", d => x(d[0]))
        .attr("width", x.bandwidth())
        .attr("y", y(0))
        .attr("height", 0)
        .attr("fill", "steelblue")
        .transition()
        .duration(1000)
        .attr("y", d => y(d[1]))
        .attr("height", d => y(0) - y(d[1]));
    
    // Add chart axes with smooth transitions
    svg.selectAll(".x-axis").remove();
    svg.selectAll(".y-axis").remove();
    
    // X-axis (state names will be added as rotated labels)
    svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x))
        .selectAll("text").remove();
    
    // Y-axis with animated transitions
    svg.append("g")
        .attr("class", "y-axis")
        .attr("transform", `translate(${margin.left},0)`)
        .transition()
        .duration(1000)
        .call(d3.axisLeft(y));
    
    // Add rotated state labels with fade transitions
    svg.selectAll(".state-label").remove();
    
    const labels = svg.selectAll(".state-label")
        .data(fatalitiesByState, d => d[0]);
    
    labels.enter()
        .append("text")
        .attr("class", "state-label")
        .attr("x", d => x(d[0]) + x.bandwidth() / 2)
        .attr("y", height - margin.bottom + 15)
        .attr("text-anchor", "end")
        .attr("font-size", "11px")
        .attr("fill", "#000")
        .attr("font-family", "sans-serif")
        .attr("transform", d => `rotate(-45, ${x(d[0]) + x.bandwidth() / 2}, ${height - margin.bottom + 15})`)
        .text(d => d[0])
        .merge(labels)
        .transition()
        .duration(1000)
        .attr("x", d => x(d[0]) + x.bandwidth() / 2)
        .attr("transform", d => `rotate(-45, ${x(d[0]) + x.bandwidth() / 2}, ${height - margin.bottom + 15})`);
    
    labels.exit().remove();
    
    // Draw interactive choropleth map
    drawInteractiveMap(fatalitiesByState);
}

function drawInteractiveMap(fatalitiesByState) {
    d3.json("states.json").then(us => {
        
        const svg = d3.select("#us-map");
        svg.selectAll("*").remove();
        
        // Create value lookup and color scale
        const valueMap = Object.fromEntries(fatalitiesByState);
        const maxVal = d3.max(fatalitiesByState, d => d[1]);
        
        // Color scale
        const color = d3.scaleSequential(d3.interpolateReds).domain([0, maxVal]);
        
        // Geographic projection and path generator
        const projection = d3.geoAlbersUsa().fitSize([800, 480], us);
        const path = d3.geoPath().projection(projection);
        
        // Draw states
        svg.selectAll("path")
            .data(us.features)
            .enter()
            .append("path")
            .attr("d", path)
            .attr("fill", d => {
                const state = d.properties.name || d.properties.NAME;
                return valueMap[state] !== undefined ? color(valueMap[state]) : "#eee";
            })
            .attr("stroke", "#333")
            .attr("stroke-width", "1px")
            .style("cursor", "pointer")
            .on("mouseover", function(event, d) {
                const state = d.properties.name || d.properties.NAME;
                console.log("Hovering over:", state);
                
                // Highlight this state
                d3.select(this)
                    .attr("stroke", "#000")
                    .attr("stroke-width", "2px");
                    
                // Highlight corresponding bar
                d3.selectAll(".bar-rect")
                    .attr("fill", function() {
                        const barData = d3.select(this).datum();
                        if (barData && barData[0] === state) {
                            return "#ff6b35";
                        }
                        return "steelblue";
                    })
                    .attr("stroke", function() {
                        const barData = d3.select(this).datum();
                        return (barData && barData[0] === state) ? "#000" : "none";
                    })
                    .attr("stroke-width", function() {
                        const barData = d3.select(this).datum();
                        return (barData && barData[0] === state) ? "2px" : "0px";
                    });
            })
            .on("mouseout", function() {
                // Reset map state styling
                d3.select(this)
                    .attr("stroke", "#333")
                    .attr("stroke-width", "1px");
                    
                // Reset bar chart styling
                d3.selectAll(".bar-rect")
                    .attr("fill", "steelblue")
                    .attr("stroke", "none")
                    .attr("stroke-width", "0px");
            });
            
        // Add animated value labels to map states
        svg.selectAll(".state-value")
            .data(us.features)
            .enter()
            .append("text")
            .attr("class", "state-value")
            .attr("x", d => path.centroid(d)[0])
            .attr("y", d => path.centroid(d)[1])
            .attr("text-anchor", "middle")
            .attr("font-size", "10px")
            .attr("fill", "#000")
            .attr("font-weight", "bold")
            .text(d => {
                const state = d.properties.name || d.properties.NAME;
                const value = valueMap[state];
                if (value === undefined) return "";
                return sortByPerCapita ? value.toFixed(1) : Math.round(value);
            });
        
        // Add color legend
        drawColorLegend(svg, color, maxVal);
        
    }).catch(error => {
        console.error("Error loading map data:", error);
    });
}

function drawColorLegend(svg, color, maxVal) {
    // Remove any existing legend
    svg.selectAll(".legend").remove();
    
    const legendWidth = 200;
    const legendHeight = 10;
    const legendX = 300; // Center it horizontally
    const legendY = 520; // Move it below the map
    
    // Create color gradient for legend
    const defs = svg.select("defs").empty() ? svg.append("defs") : svg.select("defs");
    defs.selectAll("#legend-gradient").remove();
    
    const gradient = defs.append("linearGradient")
        .attr("id", "legend-gradient")
        .attr("x1", "0%").attr("x2", "100%")
        .attr("y1", "0%").attr("y2", "0%");
    
    gradient.append("stop")
        .attr("offset", "0%")
        .attr("stop-color", color(0));
    
    gradient.append("stop")
        .attr("offset", "100%")
        .attr("stop-color", color(maxVal));
    
    // Create legend group
    const legendGroup = svg.append("g").attr("class", "legend");
    
    // Legend rectangle
    legendGroup.append("rect")
        .attr("x", legendX)
        .attr("y", legendY)
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .style("fill", "url(#legend-gradient)")
        .attr("stroke", "#333")
        .attr("stroke-width", "1px");
    
    // Legend scale and axis
    const legendScale = d3.scaleLinear()
        .domain([0, maxVal])
        .range([0, legendWidth]);
    
    const legendAxis = d3.axisBottom(legendScale)
        .ticks(5)
        .tickFormat(d => sortByPerCapita ? d.toFixed(1) : Math.round(d));
    
    legendGroup.append("g")
        .attr("transform", `translate(${legendX}, ${legendY + legendHeight})`)
        .call(legendAxis);
    
    // Legend title
    legendGroup.append("text")
        .attr("x", legendX + legendWidth / 2)
        .attr("y", legendY - 5)
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .attr("fill", "#333")
        .attr("font-weight", "bold")
        .text(sortByPerCapita ? "Fatalities per 100k population" : "Total fatalities");
}

// Toggle button handler for switching between absolute and per-capita views
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById("toggle-per-capita").onclick = function() {
        sortByPerCapita = !sortByPerCapita;
        drawInteractiveChart(cachedData2023);
    };
});
