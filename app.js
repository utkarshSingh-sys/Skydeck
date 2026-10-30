document.addEventListener("DOMContentLoaded", () => {
    const $ = s => document.querySelector(s);
    const J = u => fetch(u).then(r => r.json());
    const set = (id, html) => ($("#" + id + " .b").innerHTML = html);
    const stat = (l, v) => `<div class="stat"><small>${l}</small><b>${v}</b></div>`;
    const bar = (l, v, max) => `<div class="bar"><small>${l}: ${v ?? "--"}</small><u><s style="width:${Math.min(100, ((v || 0) / max) * 100)}%"></s></u></div>`;
    const compass = d => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(d / 45) % 8];
    const wmo = c =>
        c == 0 ? ["Clear sky", "☀️"] : c == 1 ? ["Mainly clear", "🌤️"] : c == 2 ? ["Partly cloudy", "⛅"] :
            c == 3 ? ["Overcast", "☁️"] : c < 50 ? ["Fog", "🌫️"] : c < 60 ? ["Drizzle", "🌦️"] :
                c < 70 ? ["Rain", "🌧️"] : c < 80 ? ["Snow", "🌨️"] : c < 90 ? ["Showers", "🌧️"] : ["Thunderstorm", "⛈️"];

    let place = { name: "Prayagraj, Uttar Pradesh", lat: 25.4448, lon: 81.8432 };
    let W, A, M = [], map, pin, layers = {};
    const SECTORS = [
        { name: "North Bay of Bengal", lat: 19.5, lon: 88.5 },
        { name: "Central Bay of Bengal", lat: 14.5, lon: 86.5 },
        { name: "Andaman Sea", lat: 10.5, lon: 92.0 },
        { name: "East Arabian Sea", lat: 16.5, lon: 69.5 }
    ];

    // ---------- Living sky canvas: rain, stars or drifting clouds ----------
    const cv = $("#sky"), g = cv.getContext("2d");
    let drops = [], kind = "clouds";
    const resize = () => { cv.width = innerWidth; cv.height = innerHeight; };
    window.addEventListener("resize", resize); resize();
    function seed(k) {
        kind = k;
        const n = k == "rain" ? 220 : k == "stars" ? 150 : 9;
        drops = Array.from({ length: n }, () => ({ x: Math.random() * cv.width, y: Math.random() * cv.height, s: Math.random() }));
    }
    seed("clouds");
    (function frame() {
        g.clearRect(0, 0, cv.width, cv.height);
        for (const p of drops) {
            if (kind == "rain") {
                g.strokeStyle = "rgba(190,220,255,.5)"; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - 3, p.y + 12 + p.s * 10); g.stroke();
                p.y += 10 + p.s * 12; p.x -= 1.5;
                if (p.y > cv.height) { p.y = -20; p.x = Math.random() * cv.width; }
            } else if (kind == "stars") {
                g.fillStyle = `rgba(255,255,255,${0.3 + 0.7 * Math.abs(Math.sin(Date.now() / 900 * p.s + p.x))})`;
                g.fillRect(p.x, p.y, 1 + p.s * 1.5, 1 + p.s * 1.5);
            } else {
                g.fillStyle = "rgba(255,255,255,.07)"; g.beginPath();
                g.ellipse(p.x, p.y * 0.6 + 40, 140 + p.s * 170, 28 + p.s * 30, 0, 0, 7); g.fill();
                p.x += 0.15 + p.s * 0.4; if (p.x > cv.width + 320) p.x = -320;
            }
        }
        requestAnimationFrame(frame);
    })();

    // ---------- Clock (in the selected city's own timezone) ----------
    setInterval(() => {
        $("#clock").textContent = new Date().toLocaleTimeString("en-IN", { timeZone: W?.timezone || "Asia/Kolkata", hour12: false });
    }, 1000);

    // ---------- Fetch everything ----------
    async function load() {
        const q = `latitude=${place.lat}&longitude=${place.lon}`;
        const api = "https://api.open-meteo.com/v1/forecast?";
        try {
            [W, A, M] = await Promise.all([
                J(`${api}${q}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,dew_point_2m,visibility,cape,shortwave_radiation,vapour_pressure_deficit&hourly=temperature_2m,precipitation_probability,boundary_layer_height,freezing_level_height,soil_temperature_0cm&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=auto`),
                J(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&current=us_aqi,pm10,pm2_5,nitrogen_dioxide,ozone,dust&timezone=auto`),
                J(`${api}latitude=${SECTORS.map(s => s.lat)}&longitude=${SECTORS.map(s => s.lon)}&current=surface_pressure,wind_speed_10m,wind_gusts_10m`)
            ]);
            if (!Array.isArray(M)) M = [];
            render();
        } catch (e) {
            $("#alerts").textContent = "Could not reach the weather service. Check your internet connection and try again.";
        }
    }

    // ---------- Draw the page ----------
    function render() {
        const c = W.current, h = W.hourly, d = W.daily, aq = A.current || {};
        const [label, icon] = wmo(c.weather_code);
        const i0 = Math.max(0, h.time.findIndex(t => t >= c.time.slice(0, 13)));

        $("#station").textContent = place.name;
        $("#temp").textContent = Math.round(c.temperature_2m) + "°";
        $("#cond").textContent = `${icon} ${label}`;
        $("#feels").textContent = `Feels like ${Math.round(c.apparent_temperature)}° · humidity ${c.relative_humidity_2m}% · wind ${Math.round(c.wind_speed_10m)} km/h`;
        $("#tz").textContent = W.timezone;

        // Sky phase + sun arc
        const now = new Date(c.time), sr = new Date(d.sunrise[0]), ss = new Date(d.sunset[0]), hr = 36e5;
        const phase = now < sr - hr / 2 || now > +ss + hr * 0.75 ? "night" : now < +sr + hr ? "dawn" : now > ss - hr ? "dusk" : "day";
        document.body.dataset.phase = phase;
        const t = Math.max(0, Math.min(1, (now - sr) / (ss - sr)));
        const sx = (1 - t) ** 2 * 20 + 2 * (1 - t) * t * 150 + t * t * 280;
        const sy = (1 - t) ** 2 * 130 + 2 * (1 - t) * t * -50 + t * t * 130;
        const col = phase == "night" ? "#dbe4ff" : "#ffd166";
        ["sun", "halo"].forEach(id => { const el = $("#" + id); el.setAttribute("cx", sx); el.setAttribute("cy", sy); el.setAttribute("fill", col); });
        const hm = x => x.slice(11, 16);
        $("#sr").textContent = "Sunrise " + hm(d.sunrise[0]);
        $("#ss").textContent = "Sunset " + hm(d.sunset[0]);
        seed([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(c.weather_code) ? "rain" : phase == "night" ? "stars" : "clouds");

        // Next 12 hours
        const hs = [...Array(12)].map((_, k) => i0 + k).filter(i => i < h.time.length);
        const T = hs.map(i => h.temperature_2m[i]), lo = Math.min(...T) - 2, hi = Math.max(...T) + 1;
        set("hourly", `<div class="strip">${hs.map(i => `<div><span>${Math.round(h.temperature_2m[i])}°</span><i style="height:${20 + ((h.temperature_2m[i] - lo) / (hi - lo || 1)) * 70}%"></i><em>${h.precipitation_probability[i] ?? 0}%</em><small>${h.time[i].slice(11, 13)}h</small></div>`).join("")}</div>`);

        // 7-day outlook
        const mn = Math.min(...d.temperature_2m_min), mx = Math.max(...d.temperature_2m_max), sp = mx - mn || 1;
        set("forecast", d.time.map((day, k) => {
            const l = ((d.temperature_2m_min[k] - mn) / sp) * 100, w = Math.max(8, ((d.temperature_2m_max[k] - d.temperature_2m_min[k]) / sp) * 100);
            return `<div class="row" title="Rain ${d.precipitation_sum[k]} mm · peak UV ${d.uv_index_max[k]} · wind up to ${d.wind_speed_10m_max[k]} km/h"><b>${k ? new Date(day).toLocaleDateString("en", { weekday: "short" }) : "Today"}</b><span>${wmo(d.weather_code[k])[1]}</span><em>${d.precipitation_probability_max[k] ?? 0}%</em><span class="lo">${Math.round(d.temperature_2m_min[k])}°</span><u><s style="left:${l}%;width:${w}%"></s></u><span>${Math.round(d.temperature_2m_max[k])}°</span></div>`;
        }).join(""));

        // Wind (arrow points where the wind is blowing TO)
        set("wind", `<div class="compass"><div class="dial"><span>N</span><i style="transform:rotate(${c.wind_direction_10m + 180}deg)"></i></div><div>${stat("Speed", c.wind_speed_10m + " km/h")}${stat("Gusts", c.wind_gusts_10m + " km/h")}${stat("Coming from", compass(c.wind_direction_10m) + " (" + c.wind_direction_10m + "°)")}</div></div>`);

        // Humidity & pressure
        set("atmos", `<div class="ring" style="--p:${c.relative_humidity_2m}"><b>${c.relative_humidity_2m}%</b></div>${stat("Pressure", Math.round(c.surface_pressure) + " hPa")}${stat("Dew point", c.dew_point_2m + "°C")}`);

        // UV
        const uv = c.uv_index ?? 0, risk = uv < 3 ? "Low" : uv < 6 ? "Moderate" : uv < 8 ? "High" : uv < 11 ? "Very high" : "Extreme";
        set("uv", `${stat("UV index now", uv + " · " + risk)}<div class="uvbar"><i style="left:${Math.min(100, (uv / 12) * 100)}%"></i></div>${stat("Today's peak", d.uv_index_max[0])}`);

        // Clouds (in oktas, the unit forecasters use: 8 = fully covered)
        const ok = Math.round((c.cloud_cover / 100) * 8);
        set("clouds", `<div class="oktas">${[...Array(8)].map((_, k) => `<span class="${k < ok ? "on" : ""}"></span>`).join("")}</div>${stat("Sky covered", c.cloud_cover + "% (" + ok + " of 8 oktas)")}`);

        // Air quality
        const s = aq.us_aqi ?? 0;
        const lab = s <= 50 ? "Good" : s <= 100 ? "Moderate" : s <= 150 ? "Unhealthy for sensitive groups" : s <= 200 ? "Unhealthy" : s <= 300 ? "Very unhealthy" : "Hazardous";
        set("aqi", `${stat("US AQI", s + " · " + lab)}${bar("PM2.5 (µg/m³)", aq.pm2_5, 150)}${bar("PM10 (µg/m³)", aq.pm10, 250)}${bar("Ozone", aq.ozone, 180)}${bar("Nitrogen dioxide", aq.nitrogen_dioxide, 100)}${bar("Dust", aq.dust, 100)}`);

        // Storm fuel
        const cape = c.cape ?? 0, spread = (c.temperature_2m - (c.dew_point_2m ?? 0)).toFixed(1);
        set("storm", `${stat("CAPE", Math.round(cape) + " J/kg")}${stat("Visibility", ((c.visibility ?? 1e4) / 1000).toFixed(1) + " km")}<p class="note">${cape < 300 ? "Stable air" : cape < 1000 ? "Marginal instability" : cape < 2500 ? "Strong storm fuel" : "Extreme storm potential"}</p>`);

        // Physics
        set("physics", `${stat("Solar irradiance", Math.round(c.shortwave_radiation ?? 0) + " W/m²")}${stat("Boundary layer (smog lid)", Math.round(h.boundary_layer_height?.[i0] ?? 0) + " m")}${stat("Freezing level", Math.round(h.freezing_level_height?.[i0] ?? 0) + " m")}${stat("Vapour pressure deficit", (c.vapour_pressure_deficit ?? 0) + " kPa")}${stat("Ground temperature", (h.soil_temperature_0cm?.[i0] ?? "--") + "°C")}`);

        // Cyclone watch
        const cls = (w, p) => w >= 89 ? "Severe cyclonic storm" : w >= 62 ? "Cyclonic storm" : w >= 50 ? "Deep depression" : w >= 31 || p < 1000 ? "Depression" : p < 1004 ? "Low-pressure area" : "Normal";
        set("cyclone", `<div class="sectors">${SECTORS.map((sec, k) => { const m = M[k]?.current || {}, p = m.surface_pressure ?? "--", w = m.wind_speed_10m ?? 0; return `<div><small>${sec.name}</small><b>${p} hPa · ${w} km/h</b><em>${cls(w, p)}</em></div>`; }).join("")}</div>`);

        // Sky check (alerts)
        const pbl = h.boundary_layer_height?.[i0] ?? 800, alerts = [];
        if (c.temperature_2m >= 40) alerts.push("Heatwave level heat (40°C or more)");
        if (spread < 2.2 && c.relative_humidity_2m > 85) alerts.push("Fog likely: air is almost saturated");
        if (pbl < 450 && (aq.pm2_5 ?? 0) > 60) alerts.push(`Smog trapped under a low lid (${Math.round(pbl)} m)`);
        if (cape >= 1000) alerts.push(`Thunderstorm fuel is high (CAPE ${Math.round(cape)} J/kg)`);
        if (c.wind_gusts_10m >= 45) alerts.push(`Strong gusts up to ${c.wind_gusts_10m} km/h`);
        $("#alerts").textContent = alerts.length ? alerts.join("  ·  ") : `Nothing unusual. Mixing depth ${Math.round(pbl)} m, dew spread ${spread}°C.`;
    }

    // ---------- India satellite + radar map ----------
    function initMap() {
        map = L.map("sat", { center: [22, 80], zoom: 4, minZoom: 3, maxZoom: 9 });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { opacity: 0.35 }).addTo(map);
        const day = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
        layers.nasa = L.tileLayer(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${day}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`, { opacity: 0.85, maxNativeZoom: 9, attribution: "NASA GIBS" }).addTo(map);
        fetch("https://api.rainviewer.com/public/weather-maps.json").then(r => r.json()).then(d => {
            const t = d.radar.past.at(-1).time;
            layers.radar = L.tileLayer(`https://tilecache.rainviewer.com/v2/radar/${t}/256/{z}/{x}/{y}/2/1_1.png`, { opacity: 0.75, maxNativeZoom: 7, attribution: "RainViewer" }).addTo(map);
        }).catch(() => { });
        pin = L.circleMarker([place.lat, place.lon], { radius: 7, fillColor: "#ffc24b", color: "#fff", weight: 2, fillOpacity: 1 }).addTo(map);
        document.querySelectorAll(".mode").forEach(b => b.onclick = () => {
            document.querySelectorAll(".mode").forEach(x => x.classList.toggle("on", x == b));
            const m = b.dataset.m;
            [["nasa", m != "radar"], ["radar", m != "clouds"]].forEach(([k, on]) => layers[k] && map[on ? "addLayer" : "removeLayer"](layers[k]));
        });
    }

    // ---------- City search ----------
    let timer;
    $("#city-input").addEventListener("input", e => {
        clearTimeout(timer);
        const q = e.target.value.trim(), dd = $("#city-dropdown");
        if (q.length < 2) { dd.style.display = "none"; return; }
        timer = setTimeout(async () => {
            try {
                const res = (await J(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6`)).results || [];
                dd.innerHTML = res.map((x, k) => `<div data-k="${k}">${x.name}, ${x.admin1 || x.country || ""}</div>`).join("");
                dd.style.display = res.length ? "block" : "none";
                dd.querySelectorAll("div").forEach(el => el.onclick = () => {
                    const x = res[el.dataset.k];
                    place = { name: `${x.name}, ${x.admin1 || x.country || ""}`, lat: x.latitude, lon: x.longitude };
                    dd.style.display = "none"; $("#city-input").value = "";
                    map.setView([place.lat, place.lon], 5); pin.setLatLng([place.lat, place.lon]);
                    load();
                });
            } catch (_) { }
        }, 280);
    });
    document.addEventListener("click", e => { if (!e.target.closest(".search")) $("#city-dropdown").style.display = "none"; });

    initMap();
    load();
});