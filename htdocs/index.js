import {WebXRButton} from './lib/webxr/util/webxr-button.js';
import {Scene} from './lib/webxr/render/scenes/scene.js';
import {Renderer, createWebGLContext} from './lib/webxr/render/core/renderer.js';
import {QueryArgs} from './lib/webxr/util/query-args.js';

import * as THREE from './lib/three/three.module.js';
import {CanvasCopy} from './src/CanvasCopy.js';
import {CesiumVR} from './src/CesiumVR.js'
import {CesiumVRUtil} from './src/CesiumVRUtil.js';
import {bingKey, cesiumKey} from './var.js';

// If requested, use the polyfill to provide support for mobile devices
// and devices which only support WebVR.
import WebXRPolyfill from './lib/webxr/third-party/webxr-polyfill/build/webxr-polyfill.module.js';
if (QueryArgs.getBool('usePolyfill', true)) {
  let polyfill = new WebXRPolyfill();
}

var lofi = false;
var vrEnabled = false;
var useWebGL = true;
var useWebVR = true;

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
  if (cesiumScene === null) {
    // var canvas = document.querySelector("canvas");
    var canvas = document.createElement('canvas');
    document.querySelector("#container").appendChild(canvas);
    cesiumScene = createScene(canvas);
    cesiumCamera = cesiumScene.camera;
    cesiumCamera.flyTo({
      destination : Cesium.Cartesian3.fromDegrees(-111.645898, 40.390810, 3600),  // Timp
      // destination : Cesium.Cartesian3.fromDegrees(-103.457939, 43.878265, 1650),  // Mt Rushmore
      // destination : Cesium.Cartesian3.fromDegrees(123.042885, 10.425316, 500),  // Mt Rushmore
      orientation : {
        heading : Cesium.Math.toRadians(175.0),
        pitch : Cesium.Math.toRadians(0.0),
        roll : 0.0
      }
    });
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
    gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);

    // Clear the framebuffer
    // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Loop through each of the views reported by the frame and draw them
    // into the corresponding viewport.
    for (let view of pose.views) {
      let viewport = glLayer.getViewport(view);
      gl.viewport(viewport.x, viewport.y,
                  viewport.width, viewport.height);

      for (let source of session.inputSources) {
        if (source.gamepad && source.handedness == 'right') {
          // let gamepad_pose = frame.getPose(source.gripSpace, xrRefSpace);
          var axes = source.gamepad.axes;
          var new_position = Cesium.Cartesian3.fromRadians(
            cesiumCamera.positionCartographic.longitude + (axes[2] * 0.0001)*-1,
            cesiumCamera.positionCartographic.latitude + (axes[3] * 0.0001),
            cesiumCamera.positionCartographic.height
          );
          //var new_position =  Cesium.Cartesian3.fromDegrees(-111.645898, 40.390810, 3600)
          cesiumCamera.position = new_position;
        }
      }
      cesiumScene.initializeFrame();
        
      var orignalCesiumCam = Cesium.Camera.clone(cesiumCamera);
      cVR.deriveRecommendedParameters(pose);
      cVR.applyVRRotation(cesiumCamera, pose);
      cesiumScene.render();
      cVR.configureSlaveCamera(orignalCesiumCam, cesiumCamera);

      // Draw this view of the scene. What happens in this function really
      // isn't all that important. What is important is that it renders
      // into the XRWebGLLayer's framebuffer, using the viewport into that
      // framebuffer reported by the current view, and using the
      // projection matrix and view transform from the current view.
      // We bound the framebuffer and viewport up above, and are passing
      // in the appropriate matrices here to be used when rendering.
      //scene.draw(view.projectionMatrix, view.transform);
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
