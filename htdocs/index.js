import {WebXRButton} from "WebXR-Button";

import VAR from "./var.js";
window.CESIUM_BASE_URL = "./lib/cesium/Build/CesiumUnminified";

import * as Cesium from "CesiumJS";
import CesiumVR from "./src/CesiumVR.js"

const LOFI_ENABLED = false;
const IMAGERY_URL = "lib/cesium/Source/Assets/Textures/";

// If needed, use the polyfill to provide support for mobile devices
// and devices which only support WebVR.
import WebXRPolyfill from "./lib/webxr-samples/third-party/webxr-polyfill/build/webxr-polyfill.module.js";

window.__is_polyfill = false;
window.__xr = navigator.xr;
if (__xr == undefined) {
  console.log("WebXR not detected. Reverting to WebXRPolyfill");
  __is_polyfill = true;
  __xr = new WebXRPolyfill();
  if (!__xr)
	  console.error("WebXRPolyfill failed to initialize");
} else {
  if (__xr.constructor.toString().substr(0, 37).indexOf("native") > 0) {
	  console.log("Native WebXR running");
  } else {
	  console.log("WebXR Emulator Extension detected");
	  __is_polyfill = true;
  }
}
const XR_IS_POLYFILL = __is_polyfill; delete window.__is_polyfill;
const XR = __xr; delete window.__xr;

// XR globals.
let xrButton = null;
let xrRefSpace = null;
let cVR = null;

// WebGL scene globals.
let gl = null;

let cesiumScene = null;
let cesiumCamera = null;

async function createImageryProvider() {
  if (LOFI_ENABLED) {
	  return await Cesium.TileMapServiceImageryProvider.fromUrl(IMAGERY_URL + "NaturalEarthII");
  } else {
	  return await Cesium.BingMapsImageryProvider.fromUrl(
	    "https://dev.virtualearth.net", {
		    key: VAR.bingKey,
		    mapStyle : Cesium.BingMapsStyle.AERIAL,
	    }
	  );
  }
}

async function createTerrainProvider() {
  if (LOFI_ENABLED) {
	  return new Cesium.EllipsoidTerrainProvider();
  } else {
	  return await Cesium.createWorldTerrainAsync();
  }
}

async function createScene(canvas) {
  Cesium.Ion.defaultAccessToken = VAR.cesiumKey;
  var scene = new Cesium.Scene(
	  {
	    canvas: canvas,
	    contextOptions: {
		    // https://registry.khronos.org/webgl/specs/latest/1.0/index.html#WEBGLCONTEXTATTRIBUTES
		    webgl: {
		      alpha: false, // we are not compositing the canvas
		      stencil: true, // check
		      depth: true, // check
		      xrCompatible: true,
		      antialias: false, // false: perf boost, no resolve/copy step. We need this to bitblit directly into the device FB. need more investigation.
		      preserveDrawingBuffer: false, // true: buffer copying, and flush (very bad). false: buffer swapping, fast.
		      powerPreference: "high-performance", // "default": browser chooses (lately, goes to low-power), "low-power", "high-performance"
		      //desynchronized: false, // true: introduces artifacts, but lower latency. check
		    },
		    requestWebgl2: true, // Cesium gracefully downgrades to WebGL1 if WebGL2 is not available.
		    allowTextureFilterAnisotropic: true, // false: performance improvement
	    },
	    creditContainer: document.createElement("div"), // Must set in order to use an off-screen canvas
	    creditViewport: document.createElement("div"), // Must set in order to use an off-screen canvas
	    scene3DOnly: true,
	    requestRenderMode: false,
	    //maximumRenderTimeChange: Infinity, // Never render due to a timeout. Useful?
 	    //timeChangeEnabled: false, // where did I see this? Maybe docs for a recent version.
	  }
  );

  scene.useWebVR = true;
  scene.webXRContext = {};
  //scene.focalLength = 5.0;
  //scene.eyeSeparation = camera.frustum.near * 5.0 / 30.0;

  const fog = new Cesium.Fog();
  fog.density = 0.0003;
  scene.fog = fog;

  var ellipsoid = Cesium.Ellipsoid.clone(Cesium.Ellipsoid.WGS84);
  var globe = new Cesium.Globe(ellipsoid);
  globe.imageryLayers.addImageryProvider(await createImageryProvider());
  globe.terrainProvider = await createTerrainProvider();
  scene.globe = globe;

  scene.skyAtmosphere = new Cesium.SkyAtmosphere();

  var skyBoxBaseUrl = IMAGERY_URL + "SkyBox/tycho2t3_80";
  scene.skyBox = new Cesium.SkyBox({
	  positiveX: skyBoxBaseUrl + "_px.jpg",
	  negativeX: skyBoxBaseUrl + "_mx.jpg",
	  positiveY: skyBoxBaseUrl + "_py.jpg",
	  negativeY: skyBoxBaseUrl + "_my.jpg",
	  positiveZ: skyBoxBaseUrl + "_pz.jpg",
	  negativeZ: skyBoxBaseUrl + "_mz.jpg"
  });

  return scene;
}

// Checks to see if WebXR is available and, if so, queries a list of
// XRDevices that are connected to the system.
function initXR() {
  // Adds a helper button to the page that indicates if any XRDevices are
  // available and let's the user pick between them if there's multiple.

  xrButton = new WebXRButton({
	  onRequestSession: onRequestSession,
	  onEndSession: onEndSession
  });
  document.querySelector("#button-container").appendChild(xrButton.domElement);

  // Is WebXR available on this UA?
  if (XR) {
	  // If the device allows creation of exclusive sessions set it as the
	  // target of the "Enter XR" button.
	  XR.isSessionSupported("immersive-vr").then((supported) => {
	    console.log("immersive-vr supported");
	    xrButton.enabled = supported;
	  });
  }
}

// Called when the user selects a device to present to. In response we
// will request an exclusive session from that device.
function onRequestSession() {
  return XR.requestSession("immersive-vr").then(onSessionStarted);
}

// Called when we've successfully acquired a XRSession. In response we
// will set up the necessary session state and kick off the frame loop.
function onSessionStarted(session) {
  // This informs the "Enter XR" button that the session has started and
  // that it should display "Exit XR" instead.
  xrButton.setSession(session);

  // Listen for the sessions "end" event so we can respond if the user
  // or UA ends the session for any reason.
  session.addEventListener("end", onSessionEnded);

  if (cesiumScene === null) {
	  let canvas;
	  if (XR_IS_POLYFILL)
	    canvas = document.createElement("canvas");
	  else
	    canvas = new OffscreenCanvas(320, 180); // Arbitrary initial resolution

	  createScene(canvas).then((scene) => {
	    cesiumScene = scene;
	    sessionStartedCont(session)
	  });
  } else
	  sessionStartedCont(session);
}

function sessionStartedCont(session) {
  cVR = new CesiumVR(100, session);

  // Create a WebGL context to render with, initialized to be compatible
  // with the XRDisplay we're presenting to.
  gl = cesiumScene.context._gl;

  // Use the new WebGL context to create a XRWebGLLayer and set it as the
  // sessions baseLayer. This allows any content rendered to the layer to
  // be displayed on the XRDevice.
  session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl)});

  // Get a frame of reference, which is required for querying poses. In
  // this case an "local" frame of reference means that all poses will
  // be relative to the location where the XRDevice was first detected.
  session.requestReferenceSpace("local").then((refSpace) => {
	  xrRefSpace = refSpace;

	  cesiumScene.webXRContext.refSpace = refSpace;

	  // Inform the session that we're ready to begin drawing.
	  session.requestAnimationFrame(onXRFrameFirst);
  });
}

// Called when the user clicks the "Exit XR" button. In response we end
// the session.
function onEndSession(session) {
  cesiumScene = null;
  session.end();
}

// Called either when the user has explicitly ended the session (like in
// onEndSession()) or when the UA has ended the session for any reason.
// At this point the session object is no longer usable and should be
// discarded.
function onSessionEnded(event) {
  cesiumScene = null;
  xrButton.setSession(null);
}

// On the first frame is the first time the geometry of the frame buffer is known.
// We stop here to set that geometry on our off-screen canvas and then tell
// Cesium to process a frame so it resizes accordingly.
function onXRFrameFirst(t, frame) {
  let session = frame.session;
  let glLayer = session.renderState.baseLayer;

  cesiumScene.canvas.width = glLayer.framebufferWidth;
  cesiumScene.canvas.height = glLayer.framebufferHeight;

  cesiumCamera = cesiumScene.camera;
  cesiumCamera.setView({
	  destination: Cesium.Cartesian3.fromDegrees(-111.645898, 40.390810, 3600),  // Timp
	  // destination: Cesium.Cartesian3.fromDegrees(-103.457939, 43.878265, 1650),  // Mt Rushmore
	  // destination: Cesium.Cartesian3.fromDegrees(123.042885, 10.425316, 500),  // Mt Rushmore
	  orientation: {
	    heading: Cesium.Math.toRadians(175.0),
	    pitch: Cesium.Math.toRadians(0.0),
	    roll: 0.0
	  }
  });

  cesiumScene.render();

  session.requestAnimationFrame(onXRFrame);
}

// Called every time the XRSession requests that a new frame be drawn.
function onXRFrame(t, frame) {
  let session = frame.session;

  // Per-frame scene setup. Nothing WebXR specific here.
  cesiumScene.webXRContext.frame = frame;
  cesiumScene.initializeFrame();

  // Inform the session that we're ready for the next frame.
  session.requestAnimationFrame(onXRFrame);

  // Per-frame scene setup. Nothing WebXR specific here.
  var new_position = null;
  for (let source of session.inputSources) {
	  if (source.gamepad && source.handedness == "right") {
	    // let gamepad_pose = frame.getPose(source.gripSpace, xrRefSpace);
	    var axes = source.gamepad.axes;
	    new_position = Cesium.Cartesian3.fromRadians(
		    cesiumCamera.positionCartographic.longitude + (axes[2] * 0.0001)*-1,
		    cesiumCamera.positionCartographic.latitude + (axes[3] * 0.0001),
		    cesiumCamera.positionCartographic.height
	    );
	  }
  }

  let pose = frame.getViewerPose(xrRefSpace);
  if (pose) {
	  var camView = { orientation: { heading: 0, pitch: 0, roll: 0 } };
	  if (new_position)
	    camView.destination = new_position;
	  cesiumCamera.setView(camView);
	  cVR.applyVRRotation(cesiumCamera, pose);
	  cesiumScene.render();
  } else {
	  cesiumCamera.position = new_position;
  }
}

initXR();
