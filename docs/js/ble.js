/* =====================================================================
   HARALD'S QUEST — WEB BLUETOOTH ("press the rune" mode)
   The phone connects to a rune once and STAYS connected. When a visitor
   presses the physical rune, it notifies "1" / "2" / "3" ("0" = idle,
   ignored). Must match firmware/rune/rune.ino. Do not change the UUIDs.
   ===================================================================== */

const RUNE_SERVICE_UUID = "7a1e0001-5c1d-4b6a-9f2e-6a72756e6500";
const RUNE_ID_CHAR_UUID = "7a1e0002-5c1d-4b6a-9f2e-6a72756e6500";     // rune number; notifies on press (older firmware)
const RUNE_LED_CHAR_UUID = "7a1e0003-5c1d-4b6a-9f2e-6a72756e6500";    // phone WRITES one character
const RUNE_BUTTON_CHAR_UUID = "7a1e0004-5c1d-4b6a-9f2e-6a72756e6500"; // button press notifications (if present)
const RUNE_NAME_PREFIX = "RUNE_";

const LED_IDLE = "0";       // idle
const LED_COLLECTED = "1";  // solid on (collected)
const LED_WRONG = "2";      // fast blink, then idle

const RuneBLE = (function () {
  function isSupported() {
    return !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
  }

  function canNotify(ch) {
    return !!(ch && ch.properties && (ch.properties.notify || ch.properties.indicate));
  }

  async function findPressCharacteristic(service) {
    // Prefer the dedicated button characteristic, fall back to the ID one.
    const uuids = [RUNE_BUTTON_CHAR_UUID, RUNE_ID_CHAR_UUID];
    for (let i = 0; i < uuids.length; i++) {
      try {
        const ch = await service.getCharacteristic(uuids[i]);
        if (canNotify(ch)) return ch;
      } catch (err) { /* not on this firmware */ }
    }
    return null;
  }

  /* Opens the Bluetooth picker, connects and starts listening for presses.
     handlers:
       onStage("searching" | "connecting")
       onPress(id, conn)   — called with 1/2/3 each time the rune is pressed
       onDisconnect(conn)  — called if the connection drops
     Returns conn = { device, name, ledChar, pressChar }.
     Throws on cancel or failure (and disconnects first). */
  async function connect(handlers) {
    const h = handlers || {};
    h.onStage && h.onStage("searching");
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: RUNE_NAME_PREFIX }],
      optionalServices: [RUNE_SERVICE_UUID]
    });
    h.onStage && h.onStage("connecting");
    try {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(RUNE_SERVICE_UUID);
      const ledChar = await service.getCharacteristic(RUNE_LED_CHAR_UUID);
      const pressChar = await findPressCharacteristic(service);
      if (!pressChar) throw new Error("This rune does not send button presses. Check its firmware.");

      const conn = { device: device, name: device.name || "Rune", ledChar: ledChar, pressChar: pressChar };

      pressChar.addEventListener("characteristicvaluechanged", function (e) {
        const text = new TextDecoder().decode(e.target.value).trim();
        const id = parseInt(text, 10);
        if (id >= 1) h.onPress && h.onPress(id, conn); // "0" = idle → ignore
      });
      await pressChar.startNotifications();

      device.addEventListener("gattserverdisconnected", function () {
        h.onDisconnect && h.onDisconnect(conn);
      });
      return conn;
    } catch (err) {
      disconnect({ device: device });
      throw err;
    }
  }

  /* Writes one LED mode character. Never throws (LED is a bonus). */
  async function writeLed(conn, mode) {
    if (!conn || !conn.ledChar) return;
    try {
      const data = new TextEncoder().encode(String(mode));
      if (conn.ledChar.writeValueWithResponse) await conn.ledChar.writeValueWithResponse(data);
      else await conn.ledChar.writeValue(data);
    } catch (err) {
      console.warn("LED write failed", err);
    }
  }

  function isConnected(conn) {
    return !!(conn && conn.device && conn.device.gatt && conn.device.gatt.connected);
  }

  function disconnect(conn) {
    try {
      if (isConnected(conn)) conn.device.gatt.disconnect();
    } catch (err) {
      console.warn("Disconnect failed", err);
    }
  }

  return { isSupported: isSupported, connect: connect, writeLed: writeLed, isConnected: isConnected, disconnect: disconnect };
})();
