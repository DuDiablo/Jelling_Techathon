/* Harald's Quest — RUNE_CONTROLLER (the joystick, from the firmware team)
   An ESP32 with a joystick and an action button, built with CONTROL_MODE 1.
   It has its own Bluetooth service, so it never gets mixed up with the runes (ble.js).

   Service 7a1e0010-…   device name "RUNE_CONTROLLER"
   - 7a1e0011 (notify)  controls as text "x,y,a"
                        x: -1 left … 1 right, y: -1 down … 1 up, a: 1 = action pressed
   - 7a1e0012 (write)   sounds on the controller: "1" click, "2" win, "3" lose

   Only used by "Sail to Jelling", which opens after all three runes are found. */
const Controller = (function () {
  "use strict";

  const NAME = "RUNE_CONTROLLER";
  const SVC = "7a1e0010-5c1d-4b6a-9f2e-6a72756e6500";
  const INPUT = "7a1e0011-5c1d-4b6a-9f2e-6a72756e6500";
  const FX = "7a1e0012-5c1d-4b6a-9f2e-6a72756e6500";
  const SOUND = { click: "1", win: "2", lose: "3" };

  const handlers = { input: [], press: [], state: [] };
  let device = null, fxChar = null, inputChar = null;
  let connected = false, lastA = 0;
  let writing = false, queued = null;

  function emit(type, value) { handlers[type].forEach(function (fn) { try { fn(value); } catch (e) { /* ignore */ } }); }
  function num(v) { const n = Number(v); return isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0; }

  function onValue(e) {
    const parts = new TextDecoder().decode(e.target.value).trim().split(",");
    const x = num(parts[0]), y = num(parts[1]), a = Number(parts[2]) === 1 ? 1 : 0;
    emit("input", { x: x, y: y, a: a });
    if (a === 1 && lastA !== 1) emit("press");   // only the moment it's pressed down
    lastA = a;
  }

  function onDisconnected() {
    connected = false;
    fxChar = null;
    inputChar = null;
    lastA = 0;
    emit("input", { x: 0, y: 0, a: 0 });
    emit("state", "disconnected");
  }

  async function connect() {
    if (!supported()) throw new Error("unsupported");
    emit("state", "choosing");
    try {
      device = await navigator.bluetooth.requestDevice({ filters: [{ name: NAME }], optionalServices: [SVC] });
    } catch (e) {
      emit("state", connected ? "connected" : "idle");   // chooser closed
      throw e;
    }
    device.removeEventListener("gattserverdisconnected", onDisconnected);
    device.addEventListener("gattserverdisconnected", onDisconnected);
    emit("state", "connecting");
    try {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(SVC);
      inputChar = await service.getCharacteristic(INPUT);
      await inputChar.startNotifications();
      inputChar.addEventListener("characteristicvaluechanged", onValue);
      try { fxChar = await service.getCharacteristic(FX); } catch (e) { fxChar = null; } // sounds are optional
      connected = true;
      lastA = 0;
      emit("state", "connected");
    } catch (e) {
      try { if (device.gatt.connected) device.gatt.disconnect(); } catch (err) { /* ignore */ }
      connected = false;
      emit("state", "failed");
      throw e;
    }
  }

  function disconnect() {
    try { if (device && device.gatt.connected) device.gatt.disconnect(); } catch (e) { /* ignore */ }
  }

  // One write at a time (Bluetooth can't overlap them); the newest waiting sound wins.
  async function sound(kind) {
    const code = SOUND[kind] || kind;
    if (!fxChar || !connected) return;
    if (writing) { queued = code; return; }
    writing = true;
    try { await fxChar.writeValue(new TextEncoder().encode(code)); } catch (e) { /* ignore */ }
    writing = false;
    if (queued) { const next = queued; queued = null; sound(next); }
  }

  function supported() { return !!(navigator.bluetooth && navigator.bluetooth.requestDevice); }

  return {
    supported: supported,
    connect: connect,
    disconnect: disconnect,
    sound: sound,
    isConnected: function () { return connected; },
    on: function (type, fn) { handlers[type].push(fn); },
    // for testing without hardware: Controller._feed("0.5,1,0")
    _feed: function (text) { onValue({ target: { value: new TextEncoder().encode(text) } }); }
  };
})();
