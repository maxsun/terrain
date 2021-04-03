import './App.css';
import Martini from '@mapbox/martini';
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls';
import React from 'react';
import { PNG } from 'pngjs/browser';

function mapboxTerrainToGrid(png) {
  const tileSize = png.width;
  const gridSize = tileSize + 1;
  const terrain = new Float32Array(gridSize * gridSize);

  // decode terrain values
  for (let y = 0; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      const k = (y * tileSize + x) * 4;
      const r = png.data[k + 0];
      const g = png.data[k + 1];
      const b = png.data[k + 2];
      terrain[y * gridSize + x] = (r * 256 * 256 + g * 256.0 + b) / 10.0 - 10000.0;
    }
  }
  // backfill right and bottom borders
  for (let x = 0; x < gridSize - 1; x += 1) {
    terrain[gridSize * (gridSize - 1) + x] = terrain[gridSize * (gridSize - 2) + x];
  }
  for (let y = 0; y < gridSize; y += 1) {
    terrain[gridSize * y + gridSize - 1] = terrain[gridSize * y + gridSize - 2];
  }

  return terrain;
}

function loadGeometry(url, callback) {
  const geometry = new THREE.BufferGeometry();
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.responseType = 'arraybuffer';
  xhr.onload = function () { // should handle error here
    if (this.status === 200) {
      new PNG({ filterType: 4 }).parse(this.response, (error, data) => {
        if (error !== null) {
          console.error('Problem fetching image data:', error);
        } else {
          const tileSize = 1024;
          const gridSize = tileSize + 1;
          //   const metersPerPixel = 120;

          const terrain = mapboxTerrainToGrid(data);
          const martini = new Martini(tileSize + 1);

          const tile = martini.createTile(terrain);
          const mesh = tile.getMesh(0.01);

          const { vertices, triangles } = mesh;
          const exag = 25;
          const numVertices = vertices.length / 2;
          const verts3d = new Float32Array(3 * numVertices);
          const uvs = new Float32Array(2 * numVertices);

          let c = 0;
          for (let i = 0; i < vertices.length; i += 2) {
            const x = vertices[i];
            const y = vertices[i + 1];

            uvs[i] = x / tileSize;
            uvs[i + 1] = 1 - y / tileSize;

            verts3d[c] = 0.5 - x / tileSize; // x
            verts3d[c + 1] = y / tileSize - 0.5; // y

            let z = terrain[y * gridSize + x];

            if (z >= 255) {
              z = 0;
            } else if (z >= -1) { // 255 is no-data value
              z = 0;
            }
            verts3d[c + 2] = (z / tileSize) * exag + 0.25; // z

            c += 3;
          }

          // itemSize = 3 because there are 3 values (components) per vertex
          geometry.setAttribute('position', new THREE.BufferAttribute(verts3d, 3));
          geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
          geometry.setIndex(new THREE.BufferAttribute(triangles, 1));
          geometry.computeVertexNormals();

          callback(geometry);
        }
      });
    }
  };

  xhr.send();
}

function loadTexture(lutUrl, callback) {
  const fragmentShaderTemplate = `
    varying vec3 vColor;
    varying float opacity;
    void main() {
      if (opacity != 1.) {
        discard;
      }
      gl_FragColor = vec4(vColor, opacity);
    }
  `;
  const vertexShaderTemplate = `
    vec4 deepCM[256];
    int t;
    varying vec3 vColor;
    varying float opacity;
    float h;
    void main() {

      h = pow(abs(position.z - 0.25) * 5., 3.0) * 255.0;
      t = int(floor(h)) + 5;
      if (position.z >= 0.25) {
        vColor = vec3(.2, .2, 1.);
        opacity = 0.;
      } else {
        opacity = 1.;
        %LUTCODE%
      }

      vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * modelViewPosition;
  }`;

  fetch(lutUrl).then((resp) => resp.text()).then((lutText) => {
    let lutCode = '';
    lutText.split('\n').slice(1).forEach((line) => {
      if (line.trim() !== '') {
        const components = line.split('\t');
        const i = Number.parseInt(components[0], 10);
        const r = Number.parseFloat(components[1]);
        const g = Number.parseFloat(components[2]);
        const b = Number.parseFloat(components[3]);
        lutCode += `if (t == ${255 - i}) vColor = vec3(${r / 255}, ${g / 255}, ${b / 255});\n`;
      }
    });
    console.log(lutCode);
    const material = new THREE.ShaderMaterial({
      wireframe: false,
      alphaTest: 0.9,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      fragmentShader: fragmentShaderTemplate,
      vertexShader: vertexShaderTemplate.replace('%LUTCODE%', lutCode),
    });
    callback(material);
  });
}

class App extends React.Component {
  componentDidMount() {
    this.sceneSetup();
    this.startAnimationLoop();
    this.addCustomSceneObjects();

    window.addEventListener('resize', () => this.handleWindowResize());
  }

  componentWillUnmount() {
    window.removeEventListener('resize', () => this.handleWindowResize());
    window.cancelAnimationFrame(this.requestID);
    this.controls.dispose();
  }

  handleWindowResize() {
    const width = this.el.clientWidth;
    const height = this.el.clientHeight;

    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;

    // after making changes to most of camera properties you have to call
    // .updateProjectionMatrix for the changes to take effect.
    this.camera.updateProjectionMatrix();
  }

  setRef(r) {
    this.el = r;
  }

  startAnimationLoop() {
    this.renderer.render(this.scene, this.camera);
    this.controls.update();

    // The window.requestAnimationFrame() method tells the browser that you wish to perform
    // an animation and requests that the browser call a specified function
    // to update an animation before the next repaint
    this.requestID = window.requestAnimationFrame(() => this.startAnimationLoop());
  }

  addCustomSceneObjects() {
    loadGeometry('rgb.png', (geometry) => {
      loadTexture('Deep.lut', (material) => {
        this.cube = new THREE.Mesh(geometry, material);
        this.scene.add(this.cube);
      });
    });
  }

  sceneSetup() {
    const width = this.el.clientWidth;
    const height = this.el.clientHeight;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      60, // fov = field of view
      width / height, // aspect ratio
      0.01, // near plane
      10, // far plane
    );
    this.scene.background = new THREE.Color('#010624');
    this.camera.up.set(0, 0, 1);
    this.camera.position.z = 1;

    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(width, height);
    this.el.appendChild(this.renderer.domElement); // mount using React ref

    this.controls = new MapControls(this.camera, this.renderer.domElement);

    // an animation loop is required when either damping or auto-rotation are enabled
    this.controls.enableDamping = true;
    // this.controls.dampingFactor = 0;

    // this.controls.screenSpacePanning = false;

    this.controls.target = new THREE.Vector3(0, 0, 0);
    this.controls.minDistance = 0;
    this.controls.maxDistance = 3;

    // this.controls.maxPolarAngle = Math.PI / 2;
    // const ambientLight = new THREE.AmbientLight(0x222222);
    // this.scene.add(ambientLight);
  }

  render() {
    const style = {
      height: '100%',
    };
    return <div style={style} ref={(ref) => this.setRef(ref)} />;
  }
}

export default App;
