const TOKEN_URL =
  "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token";

const BASE_URL =
  "https://tdx.transportdata.tw/api/basic/v3/Rail/TRA";

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const clientId = process.env.TDX_CLIENT_ID;
  const clientSecret = process.env.TDX_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "TDX_CLIENT_ID 或 TDX_CLIENT_SECRET 尚未設定"
    );
  }

  // Token 還沒過期，直接使用快取
  if (
    cachedToken &&
    Date.now() < tokenExpiresAt - 60 * 1000
  ) {
    return cachedToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `TDX Token 取得失敗：HTTP ${response.status} ${errorText}`
    );
  }

  const data = await response.json();

  cachedToken = data.access_token;

  tokenExpiresAt =
    Date.now() +
    (Number(data.expires_in) || 3600) * 1000;

  return cachedToken;
}


// --------------------------------------------------
// TDX API
// --------------------------------------------------

async function requestTDX(endpoint) {
  const token = await getAccessToken();

  const url = new URL(`${BASE_URL}${endpoint}`);

  url.searchParams.set("$format", "JSON");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `TDX API 失敗：HTTP ${response.status} ${errorText}`
    );
  }

  return response.json();
}


// --------------------------------------------------
// API 路由
// --------------------------------------------------

const ENDPOINTS = {

  // 即時列車
  trains:
    "/TrainLiveBoard",

  // 車站即時到離站
  stationsLive:
    "/StationLiveBoard",

  // 車站資料
  stations:
    "/Station",

  // 台鐵路線 Geometry
  shape:
    "/Shape",

  // 路線車站順序
  stationOfLine:
    "/StationOfLine",

  // 車種
  trainTypes:
    "/TrainType",

  // 特殊車次時刻
  timetable:
    "/SpecificTrainTimetable",

  // 台鐵異常
  alerts:
    "/Alert",
};


// --------------------------------------------------
// Serverless Function
// --------------------------------------------------

export default async function handler(req, res) {

  try {

    const type = req.query.type;

    if (!type) {
      return res.status(400).json({
        success: false,
        error: "缺少 type",
      });
    }


    const endpoint = ENDPOINTS[type];

    if (!endpoint) {
      return res.status(400).json({
        success: false,
        error: "未知的 API 類型",
      });
    }


    const data = await requestTDX(endpoint);


    // ------------------------------------------------
    // Cache
    // ------------------------------------------------

    if (
      type === "trains" ||
      type === "stationsLive"
    ) {

      // 即時資料
      res.setHeader(
        "Cache-Control",
        "s-maxage=20, stale-while-revalidate=40"
      );

    } else {

      // 靜態／低頻資料
      res.setHeader(
        "Cache-Control",
        "s-maxage=300, stale-while-revalidate=600"
      );
    }


    // ------------------------------------------------
    // 回傳
    // ------------------------------------------------

    return res.status(200).json(data);

  } catch (error) {

    console.error("TRA LIVE API ERROR:", error);

    return res.status(500).json({
      success: false,
      error: "TDX API 暫時無法取得資料",
      detail: error.message,
    });
  }
}
