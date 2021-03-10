import logo from './logo.svg';
import './App.css';
import Martini from '@mapbox/martini';
import * as THREE from 'three';
import { OrbitControls, MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import React from 'react';
import fs from 'fs';
import { PNG } from 'pngjs/browser';


function mapboxTerrainToGrid(png) {
    // const tileSize = Math.min(png.width, png.height);
    const tileSize = png.width;
    // const tileSize = 255;
    const gridSize = tileSize + 1;
    const terrain = new Float32Array(gridSize * gridSize);
    

    // decode terrain values
    for (let y = 0; y < tileSize; y++) {
        for (let x = 0; x < tileSize; x++) {
            const k = (y * tileSize + x) * 4;
            const r = png.data[k + 0];
            const g = png.data[k + 1];
            const b = png.data[k + 2];
            terrain[y * gridSize + x] = (r * 256 * 256 + g * 256.0 + b) / 10.0 - 10000.0;
            // terrain[y * gridSize + x] = 0;
        }
    }
    // backfill right and bottom borders
    for (let x = 0; x < gridSize - 1; x++) {
        terrain[gridSize * (gridSize - 1) + x] = terrain[gridSize * (gridSize - 2) + x];
    }
    for (let y = 0; y < gridSize; y++) {
        terrain[gridSize * y + gridSize - 1] = terrain[gridSize * y + gridSize - 2];
    }

    return terrain;
}

const geometry = new THREE.BufferGeometry();


class App extends React.Component {

    constructor(props) {
        super(props);
        this.viewerRef = React.createRef();
        this.state = {
            scene: null,
            camera: null,
            autoMove: false
        };
    }

    componentDidMount() {

        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'cropped.png', true);
        xhr.responseType = 'arraybuffer';

        const renderer = new THREE.WebGLRenderer({antialias: true});
        const { domElement } = renderer;
        this.viewerRef.current.appendChild(domElement);

        const width = domElement.parentNode.clientWidth;
        const height = domElement.parentNode.clientHeight;

                                
        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#010624");
        
        // Fix 3
        const camera = new THREE.PerspectiveCamera(
            45,
            width  / height,
            0.01,
            1000
        );

        let d = this.display;

        
        xhr.onload = function(e){
            if (this.status == 200){
                new PNG({ filterType: 4 }).parse(this.response, function (error, data) {
                    if (error !== null) {
                        console.log(error)
                        console.error('Problem fetching image data!');
                    } else {
                        
                        const tileSize = 1024;
                        const gridSize = tileSize + 1;
                        const metersPerPixel = 120;

                        let terrain = mapboxTerrainToGrid(data);
                        const martini = new Martini(tileSize + 1);
                        
                        const tile = martini.createTile(terrain);
                        const mesh = tile.getMesh(.1);
        
                        const {vertices, triangles} = mesh;
                        let exag = 3.5;
                        let verts3d = new Float32Array(3 * vertices.length / 2);
                        let uvs = new Float32Array(2 * vertices.length / 2);


                        let c = 0;
                        for (let i = 0; i < vertices.length; i += 2) {
                            let x = vertices[i];
                            let y = vertices[i + 1];

                            uvs[i] = x / tileSize;
                            uvs[i + 1] = 1 - y / tileSize;
                      

                            verts3d[c] =  0.5 - x  / tileSize; // x
                            verts3d[c + 1] = y  / tileSize - 0.5; // y

                            let z = terrain[y * gridSize + x];
                            if (z === 255) { // 255 is no-data value
                                z = 0;
                            }
                            verts3d[c + 2] = z / tileSize * exag; // z


                            c += 3;
                        }
        
                        // itemSize = 3 because there are 3 values (components) per vertex
                        geometry.setAttribute( 'position', new THREE.BufferAttribute( verts3d, 3 ) );
                        geometry.setAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ) );
                        geometry.setIndex(new THREE.BufferAttribute(triangles, 1));
                        geometry.computeVertexNormals();
                
 
                        renderer.setSize(width, height);
                

                        var textureLoader = new THREE.TextureLoader();
                            textureLoader.load('texture.png', function (texture){
                            console.log('texture loaded:', texture);

                            var material = new THREE.MeshBasicMaterial( {map: texture, wireframe: false });
                            var mesh = new THREE.Mesh( geometry, material );
                            // mesh.position.z = -100;

                            scene.add(mesh);

                            
                            camera.lookAt(new THREE.Vector3(0, 0, 0));
                            camera.up.set(0, 0, 1);
                            camera.position.set(0.2, -0.7, 0.9);
                    
    
				            const controls = new MapControls( camera, renderer.domElement );

                            //controls.addEventListener( 'change', render ); // call this only in static scenes (i.e., if there is no animation loop)

                            controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
                            controls.dampingFactor = 0.05;

                            controls.screenSpacePanning = false;

                            controls.minDistance = 0.1;
                            controls.maxDistance = 3;

                            controls.maxPolarAngle = Math.PI / 2;
          
                            d();
                    
                            var animate = function () {
                                // camera.translateZ( - 0.001 );
                                requestAnimationFrame( animate );
                                renderer.render( scene, camera );
                                controls.update();
                            };
                            animate();

                        }, undefined, function (err) {
                            console.error('texture not loaded', err)
                        });

                    
                    }
                });
            }
        };
        
        xhr.send();

        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;


    }
        

    display() {
        if (this && this.renderer) {
            this.renderer.render(this.scene, this.camera);
        }
    }


    render() {
        return (
            <div>
                <div id="renderDiv" ref={this.viewerRef}></div>
            </div>
        );
    }
}


export default App;
