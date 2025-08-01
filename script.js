import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

let sortByPerCapita = false;
let statePopulations = {};
let cachedData2023 = [];

Promise.all([
    d3.csv("accident.csv"),
    d3.csv("population.csv")
]).then(([accidentData, popData]) => {
    popData.forEach(d => {
        statePopulations[d.NAME] = +d.POPESTIMATE2023;
    });

    // Filter for 2023, cover both string and int
    cachedData2023 = accidentData.filter(d => d.YEAR === "2023" || d.YEAR === 2023);

    drawBarChart(cachedData2023);
});

function drawBarChart(data) {
    const width = 600, height = 300, margin = { top: 20, right: 20, bottom: 50, left: 50 };
    const svg = d3.select("#bar-chart")
        .attr("width", width)
        .attr("height", height);

    let fatalitiesByState = d3.rollups(
        data,
        v => d3.sum(v, d => d.FATALS),
        d => d.STATENAME
    );

    if (sortByPerCapita) {
        fatalitiesByState = fatalitiesByState.map(([state, totalFatalities]) => {
            const pop = statePopulations[state] || 1;
            return [state, totalFatalities / pop * 100000];
        });
    }

    fatalitiesByState.sort((a, b) => d3.descending(a[1], b[1]));

    const x = d3.scaleBand()
        .domain(fatalitiesByState.map(d => d[0]))
        .range([margin.left, width - margin.right])
        .padding(0.1);

    const y = d3.scaleLinear()
        .domain([0, d3.max(fatalitiesByState, d => d[1])])
        .nice()
        .range([height - margin.bottom, margin.top]);

    const bars = svg.selectAll("rect")
        .data(fatalitiesByState, d => d[0]);

    bars.exit()
        .transition()
        .duration(1500)
        .attr("y", y(0))
        .attr("height", 0)
        .remove();

    bars.transition()
        .duration(1500)
        .attr("x", d => x(d[0]))
        .attr("y", d => y(d[1]))
        .attr("width", x.bandwidth())
        .attr("height", d => y(0) - y(d[1]))
        .attr("fill", "steelblue");

    bars.enter()
        .append("rect")
        .attr("x", d => x(d[0]))
        .attr("width", x.bandwidth())
        .attr("y", y(0))
        .attr("height", 0)
        .attr("fill", "steelblue")
        .transition()
        .duration(1500)
        .attr("y", d => y(d[1]))
        .attr("height", d => y(0) - y(d[1]));

    // Tooltips
    svg.selectAll("rect")
        .select("title")
        .remove();

    svg.selectAll("rect")
        .append("title")
        .text(d => sortByPerCapita
            ? `${d[0]}: ${d[1].toFixed(2)} fatalities per 100k`
            : `${d[0]}: ${d[1]} fatalities`
        );

    // Axes transitions
    svg.selectAll(".x-axis").remove();
    svg.selectAll(".y-axis").remove();

    svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).tickSizeOuter(0));

    // Remove axis labels generated by d3.axisBottom
    svg.selectAll(".x-axis text").remove();

    svg.append("g")
        .attr("class", "y-axis")
        .attr("transform", `translate(${margin.left},0)`)
        .transition()
        .duration(1500)
        .call(d3.axisLeft(y));

    // Add or update state labels under bars
    const labels = svg.selectAll(".bar-label")
        .data(fatalitiesByState, d => d[0]);

    labels.enter()
        .append("text")
        .attr("class", "bar-label")
        .attr("y", height - margin.bottom + 20)
        .attr("x", d => x(d[0]) + x.bandwidth() / 2)
        .attr("text-anchor", "end")
        .attr("font-size", "10px")
        .attr("fill", "#222")
        .attr("transform", d => `rotate(-45,${x(d[0]) + x.bandwidth() / 2},${height - margin.bottom + 20})`)
        .text(d => d[0])
        .merge(labels)
        .transition()
        .duration(1500)
        .attr("x", d => x(d[0]) + x.bandwidth() / 2)
        .attr("transform", d => `rotate(-45,${x(d[0]) + x.bandwidth() / 2},${height - margin.bottom + 20})`);

    labels.exit().remove();

    drawUSMap(fatalitiesByState);
}

function drawUSMap(fatalitiesByState) {
    d3.json("states.json").then(us => {
        const svg = d3.select("#us-map");
        svg.selectAll("*").remove();

        // Map state names to values
        const valueMap = Object.fromEntries(fatalitiesByState);

        // Color scale
        const maxVal = d3.max(fatalitiesByState, d => d[1]);
        const color = d3.scaleSequential(d3.interpolateReds)
            .domain([0, maxVal]);

        // Projection and path
        const projection = d3.geoAlbersUsa().fitSize([800, 500], us);
        const path = d3.geoPath().projection(projection);

        // Draw states with transition
        const paths = svg.selectAll("path")
            .data(us.features, d => d.properties.name || d.properties.NAME);

        paths.enter()
            .append("path")
            .attr("d", path)
            .attr("fill", d => {
                const state = d.properties.name || d.properties.NAME;
                return valueMap[state] !== undefined ? color(valueMap[state]) : "#eee";
            })
            .attr("stroke", "#333")
            .merge(paths)
            .transition()
            .duration(1500)
            .attr("fill", d => {
                const state = d.properties.name || d.properties.NAME;
                return valueMap[state] !== undefined ? color(valueMap[state]) : "#eee";
            });

        // Draw value labels with transition
        const texts = svg.selectAll("text")
            .data(us.features, d => d.properties.name || d.properties.NAME);

        texts.enter()
            .append("text")
            .attr("x", d => path.centroid(d)[0])
            .attr("y", d => path.centroid(d)[1])
            .attr("text-anchor", "middle")
            .attr("font-size", "10px")
            .attr("fill", "#222")
            .text(d => {
                const state = d.properties.name || d.properties.NAME;
                const val = valueMap[state];
                if (val === undefined) return "";
                return sortByPerCapita ? val.toFixed(1) : val;
            })
            .merge(texts)
            .transition()
            .duration(1500)
            .attr("x", d => path.centroid(d)[0])
            .attr("y", d => path.centroid(d)[1])
            .tween("text", function(d) {
                const state = d.properties.name || d.properties.NAME;
                const val = valueMap[state];
                const that = d3.select(this);
                const prev = +that.text().replace(/,/g, '') || 0;
                const next = val || 0;
                return function(t) {
                    const interp = prev + (next - prev) * t;
                    that.text(val === undefined ? "" : (sortByPerCapita ? interp.toFixed(1) : Math.round(interp)));
                };
            });

        texts.exit().remove();

        drawColorLegend(svg, color, maxVal);
    });
}

function drawColorLegend(svg, color, maxVal) {
    const legendWidth = 200, legendHeight = 10, x = 550, y = 470;
    const defs = svg.append("defs");
    const gradient = defs.append("linearGradient")
        .attr("id", "legend-gradient")
        .attr("x1", "0%").attr("x2", "100%")
        .attr("y1", "0%").attr("y2", "0%");
    gradient.append("stop").attr("offset", "0%").attr("stop-color", color(0));
    gradient.append("stop").attr("offset", "100%").attr("stop-color", color(maxVal));

    svg.append("rect")
        .attr("x", x)
        .attr("y", y)
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .style("fill", "url(#legend-gradient)");

    const scale = d3.scaleLinear().domain([0, maxVal]).range([0, legendWidth]);
    const axis = d3.axisBottom(scale)
        .ticks(5)
        .tickFormat(d => sortByPerCapita ? d.toFixed(1) : Math.round(d));

    svg.append("g")
        .attr("transform", `translate(${x},${y + legendHeight})`)
        .call(axis);
}

document.getElementById("toggle-per-capita").onclick = function() {
    sortByPerCapita = !sortByPerCapita;
    drawBarChart(cachedData2023);
};
