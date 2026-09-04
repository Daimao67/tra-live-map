const map = L.map("map", {
  zoomControl: true,
  preferCanvas: true
}).setView([23.7, 121.0], 8);

L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 19
  }
).addTo(map);


/* =========================================================
   STATE
========================================================= */

let trains = [];
let stations = [];
let stationLive = [];
let alerts = [];

let stationById = new Map();
let trainMarkers = new Map();
let stationMarkers = new Map();

let selectedTrainNo = null;
let selectedStationId = null;
let currentFilter = "all";

let searchItems = [];


/* =========================================================
   ELEMENTS
========================================================= */

const trainList = document.getElementById("trainList");
const trainCount = document.getElementById("trainCount");
const delayCount = document.getElementById("delayCount");
const stationCount = document.getElementById("stationCount");
const updateText = document.getElementById("updateText");

const searchInput = document.getElementById("searchInput");

const infoPanel = document.getElementById("infoPanel");
const closePanel = document.getElementById("closePanel");

const panelKicker = document.getElementById("panelKicker");
const panelTitle = document.getElementById("panelTitle");
const panelSubtitle = document.getElementById("panelSubtitle");

const infoType = document.getElementById("infoType");
const infoDelay = document.getElementById("infoDelay");
const infoCurrent = document.getElementById("infoCurrent");
const infoDirection = document.getElementById("infoDirection");
const infoDestination = document.getElementById("infoDestination");
const infoPlatform = document.getElementById("infoPlatform");
const infoSpeed = document.getElementById("infoSpeed");
const infoUpdated = document.getElementById("infoUpdated");
const infoNextStation = document.getElementById("infoNextStation");
const infoNextMeta = document.getElementById("infoNextMeta");

const alertBar = document.getElementById("alertBar");
const alertTitle = document.getElementById("alertTitle");
const alertDescription = document.getElementById("alertDescription");

const mobileButton = document.getElementById("mobileButton");
const sidebar = document.getElementById("sidebar");


/* =========================================================
   API
========================================================= */

async function api(type) {
  const response = await fetch(`/api/tdx?type=${encodeURIComponent(type)}`, {
    cache: "no-store"
  });

  const data = await response.json();

  if (!response.ok || data.success === false) {
    throw new Error(data.detail || data.error || "API request failed");
  }

  return data;
}


/* =========================================================
   HELPERS
========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function formatDelay(minutes) {
  const n = Number(minutes || 0);

  if (n <= 0) {
    return {
      text: "準點",
      className: ""
    };
  }

  if (n >= 15) {
    return {
      text: `+${n} 分`,
      className: "very-late"
    };
  }

  return {
    text: `+${n} 分`,
    className: "late"
  };
}


function formatTime(value) {
  if (!value) return "--";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).replace("T", " ").slice(0, 19);
  }

  return date.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}


function formatShortTime(value) {
  if (!value) return "--";

  const text = String(value);

  if (text.includes("T")) {
    return text.split("T")[1].slice(0, 5);
  }

  return text.slice(0, 5);
}


function getStation(stationId) {
  return stationById.get(String(stationId));
}


function getStationName(stationId, fallback = "未知") {
  const station = getStation(stationId);

  return (
    station?.StationName?.Zh_tw ||
    station?.StationName?.zh_tw ||
    station?.StationName ||
    fallback
  );
}


function getStationEnglish(stationId) {
  const station = getStation(stationId);

  return (
    station?.StationName?.En ||
    station?.StationName?.en ||
    ""
  );
}


function getPosition(station) {
  const position = station?.StationPosition;

  if (!position) return null;

  const lat = Number(
    position.PositionLat ??
    position.positionLat ??
    position.Latitude
  );

  const lon = Number(
    position.PositionLon ??
    position.positionLon ??
    position.Longitude
  );

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return {
    lat,
    lon
  };
}


/* =========================================================
   NEXT STATION
========================================================= */

/*
  TDX TrainLiveBoard 本身沒有直接提供「下一站」。

  我們利用 StationOfLine / 路線順序資料會更準確。
  如果目前資料沒有路線順序，介面會顯示「資料不足」，
  不會亂猜。
*/

let lineStations = [];


function findNextStation(train) {
  const currentId = String(train.StationID);

  const possibleLines = lineStations.filter(line =>
    Array.isArray(line.Stations) &&
    line.Stations.some(
      s => String(s.StationID) === currentId
    )
  );

  if (!possibleLines.length) {
    return null;
  }

  const line = possibleLines[0];

  const ordered = [...line.Stations].sort(
    (a, b) => Number(a.Sequence) - Number(b.Sequence)
  );

  const index = ordered.findIndex(
    s => String(s.StationID) === currentId
  );

  if (index === -1) return null;

  /*
    Direction:
    TDX 的 Direction 通常：
    0 = 南下
    1 = 北上

    實際資料若不符合，就不硬判。
  */

  const direction = Number(train.Direction);

  if (direction === 0) {
    return ordered[index + 1] || null;
  }

  if (direction === 1) {
    return ordered[index - 1] || null;
  }

  return ordered[index + 1] || null;
}


/* =========================================================
   TRAIN ICON
========================================================= */

function createTrainIcon(train) {
  const delay = Number(train.DelayTime || 0);

  let className = "train-marker";

  if (delay >= 15) {
    className += " very-late";
  } else if (delay > 0) {
    className += " late";
  }

  return L.divIcon({
    className: "",
    html: `
      <div class="${className}">
        <span>${escapeHtml(train.TrainNo)}</span>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
}


/* =========================================================
   STATION ICON
========================================================= */

function createStationIcon(station) {
  const name =
    station?.StationName?.Zh_tw ||
    station?.StationName?.zh_tw ||
    station?.StationName ||
    "車站";

  const major =
    Number(station.StationClass) <= 2
      ? "major"
      : "";

  return L.divIcon({
    className: "",
    html: `
      <div class="station-marker ${major}">
        <div class="station-label">
          ${escapeHtml(name)}
        </div>
      </div>
    `,
    iconSize: [18, 45],
    iconAnchor: [9, 9]
  });
}


/* =========================================================
   LOAD STATIONS
========================================================= */

async function loadStations() {
  const data = await api("stations");

  stations = Array.isArray(data)
    ? data
    : [];

  stationById.clear();

  for (const station of stations) {
    if (station?.StationID != null) {
      stationById.set(
        String(station.StationID),
        station
      );
    }
  }

  stationCount.textContent = stations.length;

  drawStations();
}


/* =========================================================
   DRAW STATIONS
========================================================= */

function drawStations() {
  for (const marker of stationMarkers.values()) {
    marker.remove();
  }

  stationMarkers.clear();

  for (const station of stations) {
    const position = getPosition(station);

    if (!position) continue;

    const marker = L.marker(
      [position.lat, position.lon],
      {
        icon: createStationIcon(station),
        zIndexOffset: 100
      }
    ).addTo(map);

    marker.on("click", () => {
      selectStation(station);
    });

    stationMarkers.set(
      String(station.StationID),
      marker
    );
  }
}


/* =========================================================
   LOAD LINE STATIONS
========================================================= */

async function loadLineStations() {
  try {
    const data = await api("stationOfLine");

    lineStations = Array.isArray(data)
      ? data
      : [];
  } catch (error) {
    console.warn("StationOfLine unavailable:", error);
    lineStations = [];
  }
}


/* =========================================================
   LOAD TRAINS
========================================================= */

async function loadTrains() {
  const data = await api("trains");

  trains = Array.isArray(data)
    ? data
    : [];

  trainCount.textContent = trains.length;

  delayCount.textContent =
    trains.filter(
      train => Number(train.DelayTime || 0) > 0
    ).length;

  drawTrains();
  renderTrainList();

  updateText.textContent =
    data?.UpdateTime
      ? `更新 ${formatTime(data.UpdateTime)}`
      : "LIVE";
}


/* =========================================================
   DRAW TRAINS
========================================================= */

function drawTrains() {
  const activeIds = new Set();

  for (const train of trains) {
    const trainNo = String(train.TrainNo);

    const station = getStation(train.StationID);

    if (!station) continue;

    const position = getPosition(station);

    if (!position) continue;

    activeIds.add(trainNo);

    let marker = trainMarkers.get(trainNo);

    if (!marker) {
      marker = L.marker(
        [position.lat, position.lon],
        {
          icon: createTrainIcon(train),
          zIndexOffset: 1000
        }
      ).addTo(map);

      marker.on("click", () => {
        const latest = trains.find(
          t => String(t.TrainNo) === trainNo
        );

        if (latest) {
          selectTrain(latest);
        }
      });

      trainMarkers.set(trainNo, marker);
    } else {
      marker.setLatLng([
        position.lat,
        position.lon
      ]);

      marker.setIcon(
        createTrainIcon(train)
      );
    }

    marker.bindTooltip(
      `${train.TrainNo} ${train.TrainTypeName || ""}`,
      {
        direction: "top",
        offset: [0, -13],
        opacity: 0.92
      }
    );
  }

  /*
    清除已經不在即時資料中的列車
  */

  for (const [trainNo, marker] of trainMarkers) {
    if (!activeIds.has(trainNo)) {
      marker.remove();
      trainMarkers.delete(trainNo);
    }
  }
}


/* =========================================================
   TRAIN LIST
========================================================= */

function renderTrainList() {
  const query = searchInput.value
    .trim()
    .toLowerCase();

  let filtered = [...trains];

  if (currentFilter === "normal") {
    filtered = filtered.filter(
      t => Number(t.DelayTime || 0) <= 0
    );
  }

  if (currentFilter === "delay") {
    filtered = filtered.filter(
      t => Number(t.DelayTime || 0) > 0
    );
  }

  if (query) {
    filtered = filtered.filter(train => {
      const stationName =
        getStationName(train.StationID, "");

      return [
        train.TrainNo,
        train.TrainTypeName,
        stationName,
        train.EndingStationName
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }

  /*
    誤點較多的車排前面
  */

  filtered.sort(
    (a, b) =>
      Number(b.DelayTime || 0) -
      Number(a.DelayTime || 0)
  );

  if (!filtered.length) {
    trainList.innerHTML = `
      <div style="
        padding:30px 15px;
        text-align:center;
        color:#60757d;
        font-size:11px;
      ">
        找不到符合的列車
      </div>
    `;

    return;
  }

  trainList.innerHTML = filtered
    .map(train => {
      const delay = formatDelay(train.DelayTime);

      const currentStation =
        getStationName(train.StationID);

      const direction =
        Number(train.Direction) === 0
          ? "南下"
          : Number(train.Direction) === 1
            ? "北上"
            : "方向未知";

      const selected =
        selectedTrainNo === String(train.TrainNo)
          ? "selected"
          : "";

      return `
        <div
          class="train-item ${selected}"
          data-train="${escapeHtml(train.TrainNo)}"
        >

          <div class="train-row">

            <div>
              <span class="train-number">
                ${escapeHtml(train.TrainNo)}
              </span>

              <span class="train-type">
                ${escapeHtml(train.TrainTypeName || "未知車種")}
              </span>
            </div>

            <div class="delay ${delay.className}">
              ${delay.text}
            </div>

          </div>

          <div class="train-location">
            📍 <b>${escapeHtml(currentStation)}</b>
            →
            ${escapeHtml(
              train.EndingStationName || "未知終點"
            )}
          </div>

          <div class="train-direction">
            ${direction}
            ${train.Platform
              ? ` · 月台 ${escapeHtml(train.Platform)}`
              : ""}
          </div>

        </div>
      `;
    })
    .join("");

  document
    .querySelectorAll(".train-item")
    .forEach(item => {
      item.addEventListener("click", () => {
        const trainNo =
          item.dataset.train;

        const train = trains.find(
          t => String(t.TrainNo) === trainNo
        );

        if (train) {
          selectTrain(train);
        }
      });
    });
}


/* =========================================================
   SELECT TRAIN
========================================================= */

function selectTrain(train) {
  selectedTrainNo = String(train.TrainNo);
  selectedStationId = null;

  const currentStation =
    getStation(train.StationID);

  const currentPosition =
    getPosition(currentStation);

  const nextStation =
    findNextStation(train);

  const delay =
    formatDelay(train.DelayTime);

  panelKicker.textContent = "TRAIN";

  panelTitle.textContent =
    train.TrainNo || "--";

  panelSubtitle.textContent =
    train.TrainTypeName || "未知車種";

  infoType.textContent =
    train.TrainTypeName || "--";

  infoDelay.textContent =
    delay.text;

  infoDelay.className =
    `info-value big ${
      delay.className === "very-late"
        ? "red"
        : delay.className === "late"
          ? "orange"
          : "green"
    }`;

  infoCurrent.textContent =
    getStationName(train.StationID);

  infoDirection.textContent =
    Number(train.Direction) === 0
      ? "南下"
      : Number(train.Direction) === 1
        ? "北上"
        : "未知";

  infoDestination.textContent =
    train.EndingStationName || "--";

  infoPlatform.textContent =
    train.Platform || "未提供";

  /*
    TDX TrainLiveBoard 沒有即時 km/h
  */

  infoSpeed.textContent =
    "TDX 未提供";

  infoSpeed.className =
    "info-value";

  infoUpdated.textContent =
    formatTime(train.UpdateTime);

  if (nextStation) {
    infoNextStation.textContent =
      nextStation.StationName ||
      getStationName(nextStation.StationID);

    infoNextMeta.textContent =
      `站碼 ${nextStation.StationID}`;
  } else {
    infoNextStation.textContent =
      "目前無法判定";

    infoNextMeta.textContent =
      "TDX 即時資料不足以確認下一站";
  }

  infoPanel.classList.add("show");

  if (currentPosition) {
    map.flyTo(
      [
        currentPosition.lat,
        currentPosition.lon
      ],
      Math.max(map.getZoom(), 11),
      {
        duration: 0.8
      }
    );
  }

  const marker =
    trainMarkers.get(String(train.TrainNo));

  if (marker) {
    marker.openTooltip();
  }

  renderTrainList();
}


/* =========================================================
   SELECT STATION
========================================================= */

function selectStation(station) {
  selectedStationId =
    String(station.StationID);

  selectedTrainNo = null;

  const name =
    station?.StationName?.Zh_tw ||
    station?.StationName?.zh_tw ||
    station?.StationName ||
    "車站";

  const english =
    station?.StationName?.En ||
    station?.StationName?.en ||
    "";

  const code =
    station?.StationID || "--";

  const stationTrains =
    stationLive.filter(
      train =>
        String(train.StationID) ===
        String(station.StationID)
    );

  panelKicker.textContent = "STATION";

  panelTitle.textContent = name;

  panelSubtitle.textContent =
    english
      ? `${english} · ${code}`
      : `車站代碼 ${code}`;

  infoType.textContent =
    station.StationClass != null
      ? `車站等級 ${station.StationClass}`
      : "台鐵車站";

  infoDelay.textContent =
    `${stationTrains.length} 班`;

  infoDelay.className =
    "info-value big";

  infoCurrent.textContent =
    code;

  infoDirection.textContent =
    "台鐵";

  infoDestination.textContent =
    station.StationAddress ||
    "地址資料";

  infoPlatform.textContent =
    station.StationPhone ||
    "未提供";

  infoSpeed.textContent =
    "TDX 未提供";

  infoSpeed.className =
    "info-value";

  infoUpdated.textContent =
    station?.UpdateTime
      ? formatTime(station.UpdateTime)
      : "--";

  infoNextStation.textContent =
    stationTrains.length
      ? `${stationTrains.length} 班即時列車`
      : "目前無即時列車";

  infoNextMeta.textContent =
    stationTrains.length
      ? stationTrains
          .slice(0, 4)
          .map(t =>
            `${t.TrainNo} +${Number(t.DelayTime || 0)}分`
          )
          .join("　")
      : "此站目前沒有回報列車";

  infoPanel.classList.add("show");

  const position = getPosition(station);

  if (position) {
    map.flyTo(
      [
        position.lat,
        position.lon
      ],
      Math.max(map.getZoom(), 12),
      {
        duration: 0.8
      }
    );
  }
}


/* =========================================================
   STATION LIVE BOARD
========================================================= */

async function loadStationLive() {
  const data = await api("stationsLive");

  stationLive = Array.isArray(data)
    ? data
    : [];

  /*
    如果目前選中的車站有更新，
    重新整理資訊。
  */

  if (selectedStationId) {
    const station =
      getStation(selectedStationId);

    if (station) {
      selectStation(station);
    }
  }
}


/* =========================================================
   ALERT
========================================================= */

async function loadAlerts() {
  try {
    const data = await api("alerts");

    alerts = Array.isArray(data)
      ? data
      : [];

    if (!alerts.length) {
      alertBar.classList.remove("show");
      return;
    }

    const alert = alerts[0];

    alertTitle.textContent =
      `⚠️ ${alert.Title || "路線異常"}`;

    alertDescription.textContent =
      alert.Description ||
      "目前有台鐵營運資訊需要注意。";

    alertBar.classList.add("show");

  } catch (error) {
    console.warn("Alert API unavailable:", error);
  }
}


/* =========================================================
   MAP CLICK
========================================================= */

map.on("click", () => {
  /*
    不自動關閉資訊面板。
    讓使用者可以在地圖上操作而不會一直消失。
  */
});


/* =========================================================
   CLOSE PANEL
========================================================= */

closePanel.addEventListener("click", () => {
  infoPanel.classList.remove("show");

  selectedTrainNo = null;
  selectedStationId = null;

  renderTrainList();
});


/* =========================================================
   SEARCH
========================================================= */

searchInput.addEventListener(
  "input",
  () => {
    renderTrainList();
  }
);


/* =========================================================
   FILTERS
========================================================= */

document
  .querySelectorAll(".filter-btn")
  .forEach(button => {

    button.addEventListener("click", () => {

      document
        .querySelectorAll(".filter-btn")
        .forEach(btn =>
          btn.classList.remove("active")
        );

      button.classList.add("active");

      currentFilter =
        button.dataset.filter || "all";

      renderTrainList();
    });

  });


/* =========================================================
   MOBILE
========================================================= */

mobileButton.addEventListener(
  "click",
  () => {
    sidebar.classList.toggle("open");
  }
);


/* =========================================================
   INITIAL LOAD
========================================================= */

async function initialLoad() {
  try {

    updateText.textContent =
      "載入中...";

    await Promise.all([
      loadStations(),
      loadLineStations()
    ]);

    await Promise.all([
      loadTrains(),
      loadStationLive(),
      loadAlerts()
    ]);

    updateText.textContent =
      "LIVE";

  } catch (error) {

    console.error(error);

    updateText.textContent =
      "TDX ERROR";

    trainList.innerHTML = `
      <div style="
        padding:30px 15px;
        text-align:center;
        color:#ff8989;
        font-size:11px;
        line-height:1.7;
      ">
        無法取得 TDX 即時資料<br>
        <span style="color:#6d8087">
          ${escapeHtml(error.message)}
        </span>
      </div>
    `;
  }
}


/* =========================================================
   AUTO REFRESH
========================================================= */

async function refreshLiveData() {
  try {

    await Promise.all([
      loadTrains(),
      loadStationLive()
    ]);

    await loadAlerts();

  } catch (error) {
    console.error(
      "Live refresh failed:",
      error
    );
  }
}


/*
  TDX TrainLiveBoard 更新間隔約 30 秒。
  因此前端跟著 30 秒更新。
*/

setInterval(
  refreshLiveData,
  30 * 1000
);


/* =========================================================
   START
========================================================= */

initialLoad();
