/* =====================================================================
 * Astra 引擎基座 [L0] —— 渲染器 / 场景 / 相机 / 灯光 / 天空穹顶
 * 本模块属于 L0 core：不含任何具体游戏内容
 * ===================================================================== */
(function () {
  const A = window.Astra;
  const E = {};

  A.define({
    id: 'engine', layer: 0, deps: [],
    setup: function (ctx) {
      const cfg = (ctx && ctx.cfg) || {};
      E.init(cfg);
      return E;
    }
  });

    E.init = function (cfg) {
      const skyCfg = (cfg && cfg.sky) || {};
      const pal = (cfg && cfg.palette) || {};
      E.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      E.renderer.setSize(window.innerWidth, window.innerHeight);
      E.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      E.renderer.shadowMap.enabled = true;
      E.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      /* 电影级色调映射：画面质感的最大单点提升 */
      E.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      E.renderer.toneMappingExposure = 1.05;
      E.renderer.domElement.className = 'webgl';
      document.body.appendChild(E.renderer.domElement);

      E.scene = new THREE.Scene();
      E.scene.fog = new THREE.Fog(
        pal.fog || 0xbfe8f5,
        skyCfg.fogNear || 100,
        skyCfg.fogFar || 480
      );
      E.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);

    E.hemi = new THREE.HemisphereLight(0xcfeaff, 0x67ca7a, 0.55);
    E.scene.add(E.hemi);
    E.sun = new THREE.DirectionalLight(0xfff1d0, 1.15);
    E.sun.castShadow = true;
    E.sun.shadow.mapSize.set(2048, 2048);
    E.sun.shadow.camera.left = -60; E.sun.shadow.camera.right = 60;
    E.sun.shadow.camera.top = 60; E.sun.shadow.camera.bottom = -60;
    E.sun.shadow.camera.near = 10; E.sun.shadow.camera.far = 260;
    E.sun.shadow.bias = -0.0008;
    E.scene.add(E.sun);
    E.scene.add(E.sun.target);

    /* 天空穹顶（上下渐变，昼夜模块驱动颜色） */
    E.skyU = {
      top: { value: new THREE.Color(0x4aa7e8) },
      bottom: { value: new THREE.Color(0xbfe8f5) }
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 24, 14),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: E.skyU,
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP;' +
          'void main(){ float t = pow(max(vP.y / 900.0, 0.0), 0.62); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }'
      })
    );
    E.scene.add(sky);

    window.addEventListener('resize', function () {
      E.camera.aspect = window.innerWidth / window.innerHeight;
      E.camera.updateProjectionMatrix();
      E.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  };

  E.render = function () { E.renderer.render(E.scene, E.camera); };

  /* 柔光贴图（粒子 / 光晕通用） */
  E.glowTexture = function (inner, outer) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, inner);
    gr.addColorStop(1, outer);
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  };

  A.engine = E;
})();
