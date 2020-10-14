import * as THREE from './lib/three/three.module.js';
import {CanvasCopy} from './src/CanvasCopy.js';
import {CesiumVR} from './src/CesiumVR.js'
import {CesiumVRUtil} from './src/CesiumVRUtil.js';
import {bingKey, cesiumKey} from './var.js';
import {WebXRButton} from './src/util/webxr-button.js';
import {Renderer, createWebGLContext} from './src/render/core/renderer.js';
import {Scene} from './src/render/scenes/scene.js';
import {QueryArgs} from './js/util/query-args.js';

// If requested, use the polyfill to provide support for mobile devices
// and devices which only support WebVR.
import WebXRPolyfill from './js/third-party/webxr-polyfill/build/webxr-polyfill.module.js';
if (QueryArgs.getBool('usePolyfill', true)) {
  let polyfill = new WebXRPolyfill();
}

var lofi = false;
var vrEnabled = false;
var useWebGL = true;
var useWebVR = true;

// var canvasL = document.createElement('canvas');
// canvasL.className = "fullSize";
// document.getElementById('cesiumContainerLeft').appendChild(canvasL);
// document.getElementById("cesiumContainerLeft").style.width = vrEnabled ? "50%" : "100%";

// var canvasR = document.createElement('canvas');
// canvasR.className = "fullSize";
// document.getElementById('cesiumContainerRight').appendChild(canvasR);
// document.getElementById("cesiumContainerRight").style.visibility = vrEnabled ? "visible" : "hidden";

// var canvasCopy = new CanvasCopy(canvasR, useWebGL);

var WakeLock = CesiumVRUtil.getWakeLock();
var wakelock = new WakeLock();

var ellipsoid = Cesium.Ellipsoid.clone(Cesium.Ellipsoid.WGS84);
var imageryUrl = 'lib/cesium/Source/Assets/Textures/';

// XR globals.
let xrButton = null;
let xrRefSpace = null;

// WebGL scene globals.
let gl = null;
let renderer = null;
let scene = new Scene();
// scene.enableStats(false);
let cesiumScene = null;
let cesiumCamera = null;

let setup = false;

let cVR = null;

function createImageryProvider() {
  if (lofi) {
    return new Cesium.TileMapServiceImageryProvider({
      url : imageryUrl + 'NaturalEarthII'
    });
  } else {
    return new Cesium.BingMapsImageryProvider({
      url : '//dev.virtualearth.net',
      mapStyle : Cesium.BingMapsStyle.AERIAL,
      key: bingKey,
    // mapStyle : Cesium.BingMapsStyle.AERIAL_WITH_LABELS
    });
  }
}

function createTerrainProvider() {
  if (lofi) {
    return new Cesium.EllipsoidTerrainProvider();
  } else {
    return Cesium.createWorldTerrain();
  }
}

function createScene(canvas) {
  Cesium.Ion.defaultAccessToken = cesiumKey;
  var scene = new Cesium.Scene(
    {
      canvas : canvas,
      contextOptions: {
        webgl: {
          xrCompatible : true, 
          alpha: true,
          preserveDrawingBuffer : true,
        }
      },
      scene3DOnly : true,
      // requestRenderMode: true,
    }
  );

  scene.useWebGL = useWebGL;
  scene.useWebVR = useWebVR;

  // // Clone the frustum properties into our patched frustum object...
  // var patchedFrustum = scene.camera.frustum.clone(new PerspectiveFrustumPatch());
  // // Patch the camera frustum prototype...
  // scene.camera.frustum = patchedFrustum;

  var primitives = scene.primitives;

  var cb = new Cesium.Globe(ellipsoid);
  cb.imageryLayers.addImageryProvider(createImageryProvider());
  cb.terrainProvider = createTerrainProvider();

  scene.globe = cb;

  // Prevent right-click from opening a context menu.
  canvas.oncontextmenu = function() {
    return false;
  };

  scene.skyAtmosphere = new Cesium.SkyAtmosphere();

  var skyBoxBaseUrl = imageryUrl + 'SkyBox/tycho2t3_80';
  scene.skyBox = new Cesium.SkyBox({
    positiveX : skyBoxBaseUrl + '_px.jpg',
    negativeX : skyBoxBaseUrl + '_mx.jpg',
    positiveY : skyBoxBaseUrl + '_py.jpg',
    negativeY : skyBoxBaseUrl + '_my.jpg',
    positiveZ : skyBoxBaseUrl + '_pz.jpg',
    negativeZ : skyBoxBaseUrl + '_mz.jpg'
  });

  // var modelMatrix = Cesium.Transforms.northEastDownToFixedFrame(Cesium.Cartesian3.fromDegrees(-123.0744619, 44.0503706, 500));
  // var model = Cesium.Model.fromGltf({
  //   url : 'lib/models/CesiumAir/Cesium_Air.gltf',
  //   modelMatrix : modelMatrix,
  //   scale : 20.0,
  //   minimumPixelSize : 50,
  // });
  // scene.primitives.add(model);

  return scene;
}

var getCameraParams = function(camera) {
  return {
    "position" : camera.position,
    "right" : camera.right,
    "up" : camera.up,
    "direction" : camera.direction
  };
};

var setCameraParams = function(_, camera) {
  camera.position = _.position;
  camera.right = _.right;
  camera.up = _.up;
  camera.direction = _.direction;
};

// Checks to see if WebXR is available and, if so, queries a list of
// XRDevices that are connected to the system.
function initXR() {
  // Adds a helper button to the page that indicates if any XRDevices are
  // available and let's the user pick between them if there's multiple.

  xrButton = new WebXRButton({
    onRequestSession: onRequestSession,
    onEndSession: onEndSession
  });
  document.querySelector('#button-container').appendChild(xrButton.domElement);

  // Is WebXR available on this UA?
  if (navigator.xr) {
    // If the device allows creation of exclusive sessions set it as the
    // target of the 'Enter XR' button.
    navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
      xrButton.enabled = supported;
    });
  }
}

// Called when the user selects a device to present to. In response we
// will request an exclusive session from that device.
function onRequestSession() {
  return navigator.xr.requestSession('immersive-vr').then(onSessionStarted);
}

// Called when we've successfully acquired a XRSession. In response we
// will set up the necessary session state and kick off the frame loop.
function onSessionStarted(session) {
  // This informs the 'Enter XR' button that the session has started and
  // that it should display 'Exit XR' instead.
  xrButton.setSession(session);

  // Listen for the sessions 'end' event so we can respond if the user
  // or UA ends the session for any reason.
  session.addEventListener('end', onSessionEnded);

  updateRenderer(session, false);
  // setupScene(session);

  cVR = new CesiumVR(100, session);

  // Get a frame of reference, which is required for querying poses. In
  // this case an 'local' frame of reference means that all poses will
  // be relative to the location where the XRDevice was first detected.
  session.requestReferenceSpace('local').then((refSpace) => {
    xrRefSpace = refSpace;

    // Inform the session that we're ready to begin drawing.
    session.requestAnimationFrame(onXRFrame);
  });
}

function setupScene(session) {

}

function updateRenderer(session, is_cesium, context) {
  // Create a WebGL context to render with, initialized to be compatible
  // with the XRDisplay we're presenting to.
  
    // ###### CESIUM ######


  // gl = createWebGLContext({
  //   xrCompatible: true
  // });
  
  if (cesiumScene === null) {
    // var canvas = document.querySelector("canvas");
    var canvas = document.createElement('canvas');
    document.querySelector("#container").appendChild(canvas);
    cesiumScene = createScene(canvas);
    cesiumCamera = cesiumScene.camera;
    cesiumScene.initializeFrame();
    cesiumScene.render();
  }

  gl = cesiumScene.context._gl;
  // Create a renderer with that GL context (this is just for the samples
  // framework and has nothing to do with WebXR specifically.)
  // renderer = new Renderer(gl);
  renderer = new Renderer(gl);

  // Set the scene's renderer, which creates the necessary GPU resources.
  scene.setRenderer(renderer);

  // Use the new WebGL context to create a XRWebGLLayer and set it as the
  // sessions baseLayer. This allows any content rendered to the layer to
  // be displayed on the XRDevice.
  session.updateRenderState({ baseLayer: new XRWebGLLayer(session, cesiumScene.context._originalGLContext) });
  var i = 0;
}

// Called when the user clicks the 'Exit XR' button. In response we end
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
  xrButton.setSession(null);

  // // In this simple case discard the WebGL context too, since we're not
  // // rendering anything else to the screen with it.
  // renderer = null;
}

// Called every time the XRSession requests that a new frame be drawn.
function onXRFrame(t, frame) {
  let session = frame.session;

  // Per-frame scene setup. Nothing WebXR specific here.
  // scene.startFrame();
  // var cesiumScene = createScene(canvasL);
  // var foo = cesiumScene.request

  // Inform the session that we're ready for the next frame.
  session.requestAnimationFrame(onXRFrame);

  // Get the XRDevice pose relative to the Frame of Reference we created
  // earlier.
  let pose = frame.getViewerPose(xrRefSpace);

  // Getting the pose may fail if, for example, tracking is lost. So we
  // have to check to make sure that we got a valid pose before attempting
  // to render with it. If not in this case we'll just leave the
  // framebuffer cleared, so tracking loss means the scene will simply
  // disappear.
  if (pose) {
    let glLayer = session.renderState.baseLayer;

    // If we do have a valid pose, bind the WebGL layer's framebuffer,
    // which is where any content to be displayed on the XRDevice must be
    // rendered.
    // gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);

    // Clear the framebuffer
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Loop through each of the views reported by the frame and draw them
    // into the corresponding viewport.
    for (let view of pose.views) {
      let viewport = glLayer.getViewport(view);
      gl.viewport(viewport.x, viewport.y,
                  viewport.width, viewport.height);

      Cesium.requestAnimationFrame(()=>{
        cesiumScene.initializeFrame();
    
        var orignalCesiumCam = Cesium.Camera.clone(cesiumCamera);
        cVR.deriveRecommendedParameters(pose);
        cVR.applyVRRotation(cesiumCamera, pose);
        var VRCam = Cesium.Camera.clone(cesiumCamera);
        cVR.configureSlaveCamera(VRCam, cesiumCamera, 'right');
        cesiumScene.render();
        cVR.configureSlaveCamera(VRCam, cesiumCamera, 'left');
        cesiumScene.render();
        cVR.configureSlaveCamera(orignalCesiumCam, cesiumCamera);
      });

      // Draw this view of the scene. What happens in this function really
      // isn't all that important. What is important is that it renders
      // into the XRWebGLLayer's framebuffer, using the viewport into that
      // framebuffer reported by the current view, and using the
      // projection matrix and view transform from the current view.
      // We bound the framebuffer and viewport up above, and are passing
      // in the appropriate matrices here to be used when rendering.
      scene.draw(view.projectionMatrix, view.transform);
    }
  } else {
    // There's several options for handling cases where no pose is given.
    // The simplest, which these samples opt for, is to simply not draw
    // anything. That way the device will continue to show the last frame
    // drawn, possibly even with reprojection. Alternately you could
    // re-draw the scene again with the last known good pose (which is now
    // likely to be wrong), clear to black, or draw a head-locked message
    // for the user indicating that they should try to get back to an area
    // with better tracking. In all cases it's possible that the device
    // may override what is drawn here to show the user it's own error
    // message, so it should not be anything critical to the application's
    // use.
  }

  // Per-frame scene teardown. Nothing WebXR specific here.
  scene.endFrame();
}

initXR();

// var cesiumVR = vrEnabled ? new CesiumVR(100.0, run) : run();
if (vrEnabled) {
  cesiumVR = new CesiumVR(100, run);
}

var container = document.getElementById('container');

function run() {
  var scene = createScene(canvasL);
  var camera = scene.camera;


  /* MAIN UPDATE LOOP */

  var tick = function() {
    // TODO: Doing this outside the vr rotation breaks mouse interaction etc
    scene.initializeFrame();

    if(vrEnabled){
      // Copy original camera without VR rotation applied
      var originalCam = Cesium.Camera.clone(camera);

      // Apply user head rotation
      cesiumVR.applyVRRotation(camera);
      var VRCam = Cesium.Camera.clone(camera);

      // Render right eye
      cesiumVR.configureSlaveCamera(VRCam, camera, 'right');
      scene.render();

      canvasCopy.copy(canvasL);

      // Render left eye
      cesiumVR.configureSlaveCamera(VRCam, camera, 'left');
      scene.render();

      // Restore camera state before VR
      cesiumVR.configureSlaveCamera(originalCam, camera);
    } else {
      scene.render();
    }

    Cesium.requestAnimationFrame(tick);
  };

  //tick();


  /* RESIZE HANDLER */

  var onResizeScene = function(canvas, scene) {
    // Render at higher resolution so the result is still sharp
    // when magnified by the barrel distortion
    var supersample = vrEnabled ? 1.0 : 1.0; // Could increase this to >1 to increase VR resolution
    var width = canvas.clientWidth * supersample;
    var height = canvas.clientHeight * supersample;

    if (canvas.width === width && canvas.height === height) {
      return;
    }

    canvas.width = width;
    canvas.height = height;

    scene.camera.frustum.aspectRatio = width / height;
  };

  var onResize = function() {
    onResizeScene(canvasR, scene);
    onResizeScene(canvasL, scene);
  };

  window.addEventListener('resize', onResize, false);
  window.setTimeout(onResize, 60);


  /* KEYBOARD INPUT HANDLERS */

  var locationIndex = 0;

  var nextLocation = function() {
    locationIndex = (locationIndex + 1) % locations.length;
    setCameraParams(locations[locationIndex], scene.camera);
  };

  var prevLocation = function() {
    locationIndex = (locationIndex === 0) ? locationIndex + locations.length - 1 : locationIndex - 1;
    setCameraParams(locations[locationIndex], scene.camera);
  };

  // Basic WASD keys implemented w/ shift for speed up.
  var onKeyDown = function(e) {
    if (e.keyCode === 'H'.charCodeAt(0)) {
      // Show the help text
      cesiumVR.recenterHeading();
      e.preventDefault();
    }
    if (e.keyCode === 13) { // Enter
      // Turn on both Canvases and enter fullscreen
      cesiumVR.goFullscreenVR(container);
      e.preventDefault();
    }
    if (e.keyCode === 'Z'.charCodeAt(0)) {
      // Go to previous location...
      prevLocation();
      e.preventDefault();
    }
    if (e.keyCode === 'X'.charCodeAt(0) ||
        e.keyCode === ' '.charCodeAt(0)) { // X or space
      // Go to next location...
      nextLocation();
      e.preventDefault();
    }
  };

  window.addEventListener('keydown', onKeyDown, false);


  /* TOUCH HANDLERS FOR MOBILE DEVICES */

  var holdTimeout = null;
  var tapTimeout = null;

  var DOUBLETAP_TIME = 500;
  var HOLDTAP_TIME   = 1000;

  var onTouch = function(e) {
    // Checks for double taps...
    if (tapTimeout == null) {
      // First tap... set timeout callback, cancelling double tap if timed out.
      tapTimeout = setTimeout(function() {
        // Single tap!
        tapTimeout = null;
      }, DOUBLETAP_TIME);

      // Setup hold timeout callback...
      holdTimeout = setTimeout(function() {
        // Cycle through locations...
        nextLocation();
        // Cancel a double tap after a hold
        tapTimeout = null;
      }, HOLDTAP_TIME);
    } else {
      // Double tap!
      clearTimeout(tapTimeout);
      tapTimeout = null;
      // Go full screen...
      cesiumVR.goFullscreenVR(container);
    }
    e.preventDefault();
  };

  var onRelease = function(e) {
    // If released, cancel the hold timeout callback...
    clearTimeout(holdTimeout);
  };

  window.addEventListener('touchstart', onTouch, false);
  window.addEventListener('touchend', onRelease, false);


  /* VR MODE HANDLER */

  var fullscreenchange = container.mozRequestFullScreen ? "mozfullscreenchange" : "webkitfullscreenchange";

  var onFullscreenChange = function() {
    vrEnabled = document.mozFullScreenElement || document.webkitFullscreenElement;

    // // Set eye containers
    // document.getElementById("cesiumContainerRight").style.visibility = vrEnabled ? "visible" : "hidden";
    // document.getElementById("cesiumContainerLeft").style.width = vrEnabled ? "50%" : "100%";
    onResize();
    
    if (CesiumVRUtil.isMobile()) {
      if (vrEnabled) {
        // Request landscape orientation
        screen.orientation.lock('landscape');
        // Request a wakelock if vr enabled and mobile
        wakelock.request();
      } else {
        // Unlock screen orientation
        screen.orientation.unlock();
        // Release the wakelock
        wakelock.release();
      }
    }
  };

  document.addEventListener(fullscreenchange, onFullscreenChange, false);


  /* HELP ALERT */

  var showHelpScreen = function() {
    var desktopHelpString = [
      "Demo controls:",
      "",
      "Enter - go into VR Mode",
      "Esc   - Exit VR Mode",
      "",
      "Z     - Jump to next location",
      "X     - Jump to previous location",
      "",
      "H     - Reset the VR device"
    ];

    var mobileHelpString = [
      "Demo controls:",
      "",
      "Double Tap - go into VR Mode",
      "Back       - Exit VR Mode",
      "",
      "Hold Touch - Jump to next location"
    ];

    if (CesiumVRUtil.isMobile()) {
      alert(mobileHelpString.join('\n')); 
    } else {
      alert(desktopHelpString.join('\n')); 
    }
  };

  showHelpScreen();
}
