/* =====================================================================
   HARALD'S QUEST — WEB BLUETOOTH
   Must match firmware/rune/rune.ino exactly. Do not change these.
   ===================================================================== */

const RUNE_SERVICE_UUID = "7a1e0001-5c1d-4b6a-9f2e-6a72756e6500";
const RUNE_ID_CHAR_UUID = "7a1e0002-5c1d-4b6a-9f2e-6a72756e6500";  // phone READS "1" / "2" / "3"
const RUNE_LED_CHAR_UUID = "7a1e0003-5c1d-4b6a-9f2e-6a72756e6500"; // phone WRITES one character
const RUNE_NAME_PREFIX = "RUNE_";

const LED_IDLE = "0";       // short flash every 2 s
const LED_COLLECTED = "1";  // solid on
const LED_WRONG = "2";      // fast blink, then idle

const RuneBLE = (function () {
  function isSupported() {
    return !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
  }

  /* Opens the Bluetooth picker, connects and reads the rune ID.
     onStage("searching" | "connecting") lets the UI update the button.
     Returns { id, device, ledChar }. Throws on cancel or failure
     (the device is disconnected before throwing). */
  async function scan(onStage) {
    onStage && onStage("searching");
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: RUNE_NAME_PREFIX }],
      optionalServices: [RUNE_SERVICE_UUID]
    });
    onStage && onStage("connecting");
    try {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(RUNE_SERVICE_UUID);
      const idChar = await service.getCharacteristic(RUNE_ID_CHAR_UUID);
      const ledChar = await service.getCharacteristic(RUNE_LED_CHAR_UUID);
      const value = await idChar.readValue();
      const text = new TextDecoder().decode(value).trim();
      const id = parseInt(text, 10);
      if (!id) throw new Error("Rune sent an unknown ID: \"" + text + "\"");
      return { id: id, device: device, ledChar: ledChar };
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

  /* Always call after handling a rune so it is free for the next visitor. */
  function disconnect(conn) {
    try {
      if (conn && conn.device && conn.device.gatt && conn.device.gatt.connected) conn.device.gatt.disconnect();
    } catch (err) {
      console.warn("Disconnect failed", err);
    }
  }

  return { isSupported: isSupported, scan: scan, writeLed: writeLed, disconnect: disconnect };
})();
