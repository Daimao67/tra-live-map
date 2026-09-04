// ============================================================
// TRA LIVE
// Taiwan Railway Live Map
// ============================================================


// ============================================================
// MAP
// ============================================================

const map = L.map("map", {
  zoomControl: false,
  preferCanvas: true
}).setView(
  [23.75, 121.05],
  7
);


L.control.zoom({
  position: "bottomleft"
}).addTo(map);


L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,

    attribution:
      "© OpenStreetMap contributors"
  }
).addTo(map);


// ============================================================
// LAYERS
// ============================================================

const stationLayer =
  L.layerGroup().addTo(map);

const trainLayer =
  L.layerGroup().addTo(map);

const lineLayer =
  L.layerGroup().addTo(map);


// ============================================================
// DATA
// ============================================================

const stations = new Map();

const trains = new Map();

const searchItems = [];


// ============================================================
// HELPERS
// ============================================================

const $ = id =>
  document.getElementById(id);


function escapeHTML(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function formatDelay(delay) {

  const n =
    Number(delay || 0);

  if (n > 0) {
    return `+${n} 分鐘`;
  }

  return "準點";
}


function delayClass(delay) {

  return Number(delay || 0) > 0
    ? "late"
    : "good";
}


function formatTime(value) {

  if (!value) {
    return "--";
  }

  try {

    return new Date(value)
      .toLocaleString(
        "zh-TW",
        {
          hour12: false
        }
      );

  } catch {

    return value;
  }
}


// ============================================================
// ICONS
// ============================================================

function createStationIcon() {

  return L.divIcon({

    className: "",

    html:
      `<span class="station-marker"></span>`,

    iconSize: [
      8,
      8
    ],

    iconAnchor: [
      4,
      4
    ]
  });
}


function createTrainIcon() {

  return L.divIcon({

    className: "",

    html:
      `<span class="train-marker"></span>`,

    iconSize: [
      15,
      15
    ],

    iconAnchor: [
      7,
      7
    ]
  });
}


// ============================================================
// API
// ============================================================

async function getAPI(type) {

  const response =
    await fetch(
      `/api/tdx?type=${encodeURIComponent(type)}`,
      {
        cache: "no-store"
      }
    );


  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(text);
  }


  return response.json();
}


// ============================================================
// LOAD STATIONS
// ============================================================

async function loadStations() {

  const data =
    await getAPI("stations");


  const list =
    data.Stations || [];


  for (const station of list) {

    const position =
      station.StationPosition;


    if (!position) {
      continue;
    }


    const lat =
      Number(position.PositionLat);

    const lon =
      Number(position.PositionLon);


    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      continue;
    }


    const name =
      station.StationName?.Zh_tw
      || station.StationName?.Zh_cn
      || "";


    const english =
      station.StationName?.En
      || "";


    const stationID =
      String(station.StationID);


    const marker =
      L.marker(
        [lat, lon],
        {
          icon:
            createStationIcon(),

          title:
            name
        }
      );


    marker.bindPopup(`

      <div class="popup-title">
        🚉 ${escapeHTML(name)}
      </div>

      <div class="popup-subtitle">
        ${escapeHTML(english)}
      </div>

      <div class="popup-row">
        <span>站號</span>
        <strong>
          ${escapeHTML(stationID)}
        </strong>
      </div>

      <div class="popup-row">
        <span>座標</span>
        <span>
          ${lat.toFixed(5)},
          ${lon.toFixed(5)}
        </span>
      </div>

    `);


    marker.addTo(
      stationLayer
    );


    stations.set(
      stationID,
      {
        data: station,
        marker
      }
    );


    searchItems.push({

      type:
        "station",

      id:
        stationID,

      name:
        name,

      detail:
        english,

      marker,

      lat,

      lon

    });
  }


  $("stationCount")
    .textContent =
      stations.size;
}


// ============================================================
// LOAD RAILWAY SHAPE
// ============================================================

async function loadShape() {

  try {

    const data =
      await getAPI("shape");


    const shapes =
      data.Shapes || [];


    for (const shape of shapes) {

      if (!shape.Geometry) {
        continue;
      }


      let geometry =
        shape.Geometry.trim();


      geometry =
        geometry
          .replace(
            /^LINESTRING\s*\(/i,
            ""
          )
          .replace(
            /\)\s*$/,
            ""
          );


      const points =
        geometry
          .split(",")
          .map(part => {

            const values =
              part
                .trim()
                .split(/\s+/)
                .map(Number);


            if (
              values.length < 2 ||
              !Number.isFinite(values[0]) ||
              !Number.isFinite(values[1])
            ) {
              return null;
            }


            // WKT = longitude latitude
            return [
              values[1],
              values[0]
            ];
          })
          .filter(Boolean);


      if (points.length < 2) {
        continue;
      }


      L.polyline(
        points,
        {
          color:
            "#657687",

          weight:
            2,

          opacity:
            .55
        }
      ).addTo(
        lineLayer
      );
    }

  } catch (error) {

    console.warn(
      "Shape API unavailable:",
      error
    );
  }
}


// ============================================================
// TRAIN POPUP
// ============================================================

function buildTrainPopup(train) {

  const delay =
    Number(
      train.DelayTime || 0
    );


  return `

    <div class="popup-title">
      🚆 ${escapeHTML(train.TrainNo)}
    </div>

    <div class="popup-subtitle">
      ${escapeHTML(
        train.TrainTypeName ||
        "列車"
      )}
    </div>


    <div class="popup-row">
      <span>目前回報</span>

      <strong>
        ${escapeHTML(
          train.StationName ||
          "未知"
        )}
      </strong>
    </div>


    <div class="popup-row">
      <span>誤點</span>

      <strong
        class="${delayClass(delay)}"
      >
        ${formatDelay(delay)}
      </strong>
    </div>


    <div class="popup-row">
      <span>車種</span>

      <span>
        ${escapeHTML(
          train.TrainTypeName ||
          "--"
        )}
      </span>
    </div>


    <div class="popup-row">
      <span>更新</span>

      <span>
        ${formatTime(
          train.UpdateTime
        )}
      </span>
    </div>

  `;
}


// ============================================================
// LOAD LIVE TRAINS
// ============================================================

async function loadTrains() {

  const data =
    await getAPI("trains");


  const list =
    data.TrainLiveBoards || [];


  const currentTrainNumbers =
    new Set();


  for (const train of list) {

    const trainNo =
      String(train.TrainNo);


    currentTrainNumbers.add(
      trainNo
    );


    const station =
      stations.get(
        String(train.StationID)
      );


    // TDX 沒有對應車站座標
    // 就不自行猜位置
    if (!station) {
      continue;
    }


    const position =
      station.data.StationPosition;


    const lat =
      Number(position.PositionLat);

    const lon =
      Number(position.PositionLon);


    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      continue;
    }


    let marker =
      trains.get(
        trainNo
      );


    if (!marker) {

      marker =
        L.marker(
          [lat, lon],
          {
            icon:
              createTrainIcon(),

            zIndexOffset:
              500,

            title:
              trainNo
          }
        );


      marker.addTo(
        trainLayer
      );


      trains.set(
        trainNo,
        marker
      );


      searchItems.push({

        type:
          "train",

        id:
          trainNo,

        name:
          trainNo,

        detail:
          train.TrainTypeName ||
          "列車",

        marker

      });

    } else {

      marker.setLatLng(
        [lat, lon]
      );
    }


    marker.bindPopup(
      buildTrainPopup(
        train
      )
    );
  }


  // 清除已經不在即時資料中的列車
  for (
    const [
      trainNo,
      marker
    ] of trains
  ) {

    if (
      !currentTrainNumbers.has(
        trainNo
      )
    ) {

      trainLayer.removeLayer(
        marker
      );

      trains.delete(
        trainNo
      );
    }
  }


  $("trainCount")
    .textContent =
      data.Count ??
      trains.size;


  if (data.UpdateTime) {

    $("updateTime")
      .textContent =
        `資料更新：${formatTime(
          data.UpdateTime
        )}`;
  }
}


// ============================================================
// ALERTS
// ============================================================

async function loadAlerts() {

  try {

    const data =
      await getAPI("alerts");


    const alerts =
      data.Alerts || [];


    const box =
      $("alerts");


    if (!alerts.length) {

      box.innerHTML = `

        <div class="no-alert">
          ✓ 目前沒有重大運行異常
        </div>

      `;

      return;
    }


    box.innerHTML =
      alerts
        .slice(0, 8)
        .map(alert => `

          <div class="alert-card">

            <div class="alert-title">
              ⚠️ ${escapeHTML(
                alert.Title ||
                "台鐵運行異常"
              )}
            </div>

            <div class="alert-description">
              ${escapeHTML(
                alert.Description ||
                ""
              )}
            </div>

          </div>

        `)
        .join("");

  } catch (error) {

    console.warn(
      "Alert API unavailable:",
      error
    );


    $("alerts").innerHTML = `

      <div
        style="
          color:#7f8b99;
          font-size:11px;
        "
      >
        異常資料暫時無法取得
      </div>

    `;
  }
}


// ============================================================
// SEARCH
// ============================================================

function search(query) {

  const box =
    $("searchResults");


  const value =
    query
      .trim()
      .toLowerCase();


  if (!value) {

    box.classList.remove(
      "show"
    );

    box.innerHTML = "";

    return;
  }


  const results =
    searchItems
      .filter(item => {

        const text =
          [
            item.name,
            item.detail,
            item.id
          ]
            .join(" ")
            .toLowerCase();


        return text.includes(
          value
        );
      })
      .slice(0, 12);


  if (!results.length) {

    box.innerHTML = `

      <div
        style="
          padding:13px;
          color:#7f8b99;
          font-size:11px;
        "
      >
        找不到符合的車次或車站
      </div>

    `;

    box.classList.add(
      "show"
    );

    return;
  }


  box.innerHTML =
    results
      .map(
        (item, index) => `

          <button
            class="search-result"
            data-index="${index}"
          >

            <span class="result-type">
              ${
                item.type === "train"
                  ? "🚆"
                  : "🚉"
              }
            </span>

            <span class="result-name">
              ${escapeHTML(
                item.name
              )}
            </span>

            <span class="result-detail">
              ${escapeHTML(
                item.detail ||
                ""
              )}
            </span>

          </button>

        `
      )
      .join("");


  box.classList.add(
    "show"
  );


  box
    .querySelectorAll(
      ".search-result"
    )
    .forEach(button => {

      button.onclick =
        () => {

          const item =
            results[
              Number(
                button.dataset.index
              )
            ];


          const marker =
            item.marker;


          if (
            Number.isFinite(
              item.lat
            ) &&
            Number.isFinite(
              item.lon
            )
          ) {

            map.setView(
              [
                item.lat,
                item.lon
              ],
              14
            );

          } else {

            map.setView(
              marker.getLatLng(),
              14
            );
          }


          marker.openPopup();


          box.classList.remove(
            "show"
          );
        };
    });
}


$("search")
  .addEventListener(
    "input",
    event => {

      search(
        event.target.value
      );
    }
  );


// ============================================================
// MOBILE MENU
// ============================================================

$("mobileMenu")
  .addEventListener(
    "click",
    () => {

      $("sidebar")
        .classList.toggle(
          "open"
        );
    }
  );


// ============================================================
// CONNECTION STATUS
// ============================================================

function setConnection(
  connected
) {

  const dot =
    $("connectionDot");

  const text =
    $("connectionText");


  if (connected) {

    dot.classList.remove(
      "error"
    );

    text.textContent =
      "TDX API 已連線";

  } else {

    dot.classList.add(
      "error"
    );

    text.textContent =
      "TDX API 暫時無法取得資料";
  }
}


// ============================================================
// REFRESH
// ============================================================

async function refreshLiveData() {

  try {

    await loadTrains();

    setConnection(
      true
    );

  } catch (error) {

    console.error(
      "TrainLiveBoard:",
      error
    );

    setConnection(
      false
    );
  }


  await loadAlerts();
}


// ============================================================
// INITIALIZATION
// ============================================================

async function initialize() {

  try {

    await loadStations();

    await loadShape();

    await refreshLiveData();

    console.log(
      "TRA LIVE initialized."
    );


    // TDX TrainLiveBoard
    // 每 30 秒更新

    setInterval(
      refreshLiveData,
      30 * 1000
    );


  } catch (error) {

    console.error(
      "TRA LIVE initialization failed:",
      error
    );


    setConnection(
      false
    );
  }
}


initialize();
