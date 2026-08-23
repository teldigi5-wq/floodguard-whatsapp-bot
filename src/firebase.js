const { EventEmitter } = require("events");

const BASE = (
  process.env.FIREBASE_DATABASE_URL ||
  "https://floodguard-e3215-default-rtdb.asia-southeast1.firebasedatabase.app"
).replace(/\/+$/, "");

const AUTH = process.env.FIREBASE_AUTH || "";

function url() {
  return `${BASE}/floodguard/live.json${
    AUTH ? `?auth=${encodeURIComponent(AUTH)}` : ""
  }`;
}

// Read the complete current FloodGuard live state
async function getLive() {
  const response = await fetch(url(), {
    headers: {
      "Cache-Control": "no-cache"
    }
  });

  if (!response.ok) {
    throw new Error(`Firebase HTTP ${response.status}`);
  }

  return await response.json();
}

// Real-time Firebase RTDB stream
function streamLive() {
  const emitter = new EventEmitter();

  let stopped = false;
  let retryDelay = 1000;

  async function connect() {
    while (!stopped) {
      try {
        console.log("Connecting to FloodGuard Firebase stream...");

        const response = await fetch(url(), {
          headers: {
            Accept: "text/event-stream",
            "Cache-Control": "no-cache"
          }
        });

        if (!response.ok) {
          throw new Error(
            `Firebase stream HTTP ${response.status}`
          );
        }

        if (!response.body) {
          throw new Error(
            "Firebase stream returned no response body"
          );
        }

        console.log("Firebase stream connected.");

        retryDelay = 1000;

        emitter.emit("connected");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let buffer = "";

        while (!stopped) {
          const { done, value } = await reader.read();

          if (done) {
            console.log("Firebase stream ended.");
            break;
          }

          buffer += decoder.decode(value, {
            stream: true
          });

          let eventEnd;

          while (
            (eventEnd = buffer.indexOf("\n\n")) !== -1
          ) {
            const eventBlock =
              buffer.substring(0, eventEnd);

            buffer =
              buffer.substring(eventEnd + 2);

            let eventName = "";
            let eventData = "";

            const lines =
              eventBlock.split(/\r?\n/);

            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventName =
                  line.substring(6).trim();
              }

              if (line.startsWith("data:")) {
                eventData +=
                  line.substring(5).trim();
              }
            }

            if (
              eventName === "put" ||
              eventName === "patch"
            ) {
              try {
                // Firebase told us something changed.
                // Read one complete coherent snapshot.
                const liveData =
                  await getLive();

                emitter.emit(
                  "live",
                  liveData
                );
              } catch (error) {
                emitter.emit(
                  "error",
                  error
                );
              }
            }

            if (
              eventName === "cancel" ||
              eventName === "auth_revoked"
            ) {
              throw new Error(
                `Firebase ${eventName}: ${eventData}`
              );
            }
          }
        }
      } catch (error) {
        emitter.emit(
          "error",
          error
        );
      }

      if (!stopped) {
        console.log(
          `Firebase reconnecting in ${
            retryDelay / 1000
          } seconds...`
        );

        await new Promise((resolve) =>
          setTimeout(
            resolve,
            retryDelay
          )
        );

        retryDelay =
          Math.min(
            retryDelay * 2,
            30000
          );
      }
    }
  }

  connect();

  emitter.stop = () => {
    stopped = true;
  };

  return emitter;
}

module.exports = {
  getLive,
  streamLive
};