let map;
let stationData = [];
let trainData = [];
let trainMarkers = {};

const REFRESH_MS = 30000;


// ================================
// 初始化地圖
// ================================

function initMap() {

  map = L.map("map").setView(
    [23.7, 121.0],
    8
  );

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution:
        "&copy; OpenStreetMap contributors"
    }
  ).addTo(map);
}


// ================================
// 呼叫我們自己的 TDX API
// ================================

async function getAPI(type) {

  const url =
    `/api/tdx?type=${encodeURIComponent(type)}&top=300&count=true`;

  const response =
    await fetch(url);

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.error ||
      "API 連線失敗"
    );
  }

  return data;
}


// ================================
// 載入車站
// ================================

async function loadStations() {

  const data =
    await getAPI("stations");

  stationData =
    data.Stations || [];

  drawStations();
}


// ================================
// 畫車站
// ================================

function drawStations() {

  stationData.forEach(station => {

    if (
      !station.StationPosition
    ) {
      return;
    }

    const lat =
      Number(
        station
          .StationPosition
          .PositionLat
      );

    const lon =
      Number(
        station
          .StationPosition
          .PositionLon
      );

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      return;
    }

    const marker =
      L.circleMarker(
        [lat, lon],
        {
          radius: 3,
          weight: 1,
          fillOpacity: 0.8
        }
      ).addTo(map);

    marker.bindTooltip(
      `
      ${station.StationName.Zh_tw}
      <br>
      ${station.StationID}
      `
    );

  });
}


// ================================
// 載入即時列車
// ================================

async function loadTrains() {

  const data =
    await getAPI("trains");

  trainData =
    data.TrainLiveBoards || [];

  document.getElementById(
    "trainCount"
  ).textContent =
    trainData.length;

  document.getElementById(
    "lastUpdate"
  ).textContent =
    formatTime(
      data.UpdateTime
    );

  document.getElementById(
    "apiStatus"
  ).textContent =
    "正常";

  drawTrains();
}


// ================================
// 畫列車
// ================================

function drawTrains() {

  Object.values(
    trainMarkers
  ).forEach(marker => {

    map.removeLayer(marker);

  });

  trainMarkers = {};


  trainData.forEach(train => {

    const station =
      stationData.find(
        station =>
          String(
            station.StationID
          ) ===
          String(
            train.StationID
          )
      );

    if (
      !station ||
      !station.StationPosition
    ) {
      return;
    }


    const lat =
      Number(
        station
          .StationPosition
          .PositionLat
      );

    const lon =
      Number(
        station
          .StationPosition
          .PositionLon
      );


    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      return;
    }


    const icon =
      L.divIcon({
        className: "",
        html: `
          <div class="train-marker">
            🚆
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });


    const marker =
      L.marker(
        [lat, lon],
        {
          icon: icon
        }
      ).addTo(map);


    const delay =
      Number(
        train.DelayTime || 0
      );


    const delayText =
      delay > 0
        ? `晚點 ${delay} 分`
        : "準點";


    marker.bindTooltip(
      `
      <strong>
        ${train.TrainNo}
      </strong>

      <br>

      ${
        train
          .TrainTypeName
          ?.Zh_tw || ""
      }

      <br>

      ${train.StationName}

      <br>

      ${delayText}
      `,
      {
        direction: "top"
      }
    );


    marker.on(
      "click",
      () => {

        showTrain(train);

      }
    );


    trainMarkers[
      train.TrainNo
    ] = marker;

  });
}


// ================================
// 搜尋車次
// ================================

function searchTrain() {

  const input =
    document.getElementById(
      "trainSearch"
    );

  const number =
    input.value.trim();


  const result =
    document.getElementById(
      "searchResult"
    );


  if (!number) {

    result.innerHTML =
      `
      <div class="muted">
        請輸入車次
      </div>
      `;

    return;
  }


  const train =
    trainData.find(
      item =>
        String(
          item.TrainNo
        ) === number
    );


  if (!train) {

    result.innerHTML =
      `
      <div class="muted">
        目前找不到車次
        ${number}
      </div>
      `;

    return;
  }


  const delay =
    Number(
      train.DelayTime || 0
    );


  result.innerHTML =
    `
    <div
      class="train-card"
      onclick="showTrainByNumber('${number}')"
    >

      <div class="train-number">
        ${train.TrainNo}
      </div>

      <div class="train-type">
        ${
          train
            .TrainTypeName
            ?.Zh_tw || ""
        }
      </div>

      <div>
        目前位置：
        ${train.StationName}
      </div>

      <div
        class="delay ${
          delay > 0
            ? "red"
            : "green"
        }"
      >
        ${
          delay > 0
            ? `晚點 ${delay} 分鐘`
            : "準點"
        }
      </div>

    </div>
    `;
}


// ================================
// 顯示列車
// ================================

function showTrainByNumber(
  number
) {

  const train =
    trainData.find(
      item =>
        String(
          item.TrainNo
        ) ===
        String(number)
    );


  if (train) {
    showTrain(train);
  }
}


// ================================
// 列車詳細資訊
// ================================

function showTrain(train) {

  const type =
    train
      .TrainTypeName
      ?.Zh_tw ||
    "未知車種";


  const delay =
    Number(
      train.DelayTime || 0
    );


  const station =
    stationData.find(
      item =>
        String(
          item.StationID
        ) ===
        String(
          train.StationID
        )
    );


  const message =
    `
    <strong>
      車次 ${train.TrainNo}
    </strong>

    <br><br>

    車種：
    ${type}

    <br>

    目前位置：
    ${train.StationName}

    <br>

    誤點：
    ${
      delay > 0
        ? `晚點 ${delay} 分鐘`
        : "準點"
    }

    <br>

    TDX 更新：
    ${formatTime(train.UpdateTime)}
    `;


  L.popup()
    .setLatLng(
      station &&
      station.StationPosition
        ? [
            Number(
              station
                .StationPosition
                .PositionLat
            ),
            Number(
              station
                .StationPosition
                .PositionLon
            )
          ]
        : map.getCenter()
    )
    .setContent(message)
    .openOn(map);
}


// ================================
// 載入 Alert
// ================================

async function loadAlerts() {

  const data =
    await getAPI("alerts");

  const alerts =
    data.Alerts || [];

  document.getElementById(
    "alertCount"
  ).textContent =
    alerts.length;


  const container =
    document.getElementById(
      "alerts"
    );


  if (!alerts.length) {

    container.innerHTML =
      `
      <div class="muted">
        目前沒有重大異常
      </div>
      `;

    return;
  }


  container.innerHTML =
    alerts.map(
      alert =>
        `
        <div class="alert">

          <div class="alert-title">
            🚨 ${alert.Title || "鐵路異常"}
          </div>

          <div class="alert-text">
            ${
              (alert.Description || "")
                .replace(
                  /\n/g,
                  "<br>"
                )
            }
          </div>

        </div>
        `
    ).join("");
}


// ================================
// 時間格式
// ================================

function formatTime(
  value
) {

  if (!value) {
    return "--";
  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return value;

  }


  return date.toLocaleTimeString(
    "zh-TW",
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }
  );
}


// ================================
// 初始化
// ================================

async function start() {

  initMap();


  try {

    await loadStations();

    await loadTrains();

    await loadAlerts();

  } catch (error) {

    console.error(error);

    document.getElementById(
      "apiStatus"
    ).textContent =
      "連線失敗";

  }


  setInterval(
    async () => {

      try {

        await loadTrains();

        await loadAlerts();

      } catch (error) {

        console.error(
          "更新失敗",
          error
        );

      }

    },
    REFRESH_MS
  );

}


start();
