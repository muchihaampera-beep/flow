
function processUrl(raw) {
  const input = String(raw ?? "").trim();

  if (!input || input.length > 2048) {
    return { input, error: "URL kosong atau terlalu panjang" };
  }

  let candidate = input;

  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(candidate)) {
    candidate = "https://" + candidate;
  }

  try {
    const url = new URL(candidate);

    if (!["http:", "https:"].includes(url.protocol)) {
      return { input, error: "Protokol tidak didukung" };
    }

    if (!url.hostname || !url.hostname.includes(".")) {
      return { input, error: "Domain tidak valid" };
    }

    if (url.username || url.password) {
      return { input, error: "Kredensial URL ditolak" };
    }

    return { input, url: url.href };
  } catch {
    return { input, error: "Format URL tidak valid" };
  }
}

exports.handler = async event => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: "Gunakan POST"
      })
    };
  }

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: "JSON tidak valid"
      })
    };
  }

  if (
    !Array.isArray(body.urls) ||
    body.urls.length < 1 ||
    body.urls.length > 100
  ) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: "Masukkan 1–100 URL"
      })
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      results: body.urls.map(processUrl)
    })
  };
};
